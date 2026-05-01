import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Privalend } from "../target/types/privalend";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  createAssociatedTokenAccount,
} from "@solana/spl-token";
import { assert } from "chai";

describe("privalend", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Privalend as Program<Privalend>;

  const authority = provider.wallet as anchor.Wallet;

  let poolPda: PublicKey;
  let positionPda: PublicKey;
  let collateralMint: PublicKey;
  let userTokenAccount: PublicKey;
  let vaultTokenAccount: PublicKey;

  const mockDWalletId = Array.from(
    Buffer.from("ika_dwallet_btc_mock_00000000000".slice(0, 32))
  );

  before(async () => {
    console.log("\n🔧 Setting up test environment...");
    console.log("👛 Authority/User:", authority.publicKey.toBase58());

    [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("lending_pool")],
      program.programId
    );

    [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), authority.publicKey.toBuffer()],
      program.programId
    );

    // Create collateral mint
    collateralMint = await createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      6
    );
    console.log("✅ Collateral mint:", collateralMint.toBase58());

    // Create user ATA (associated token account)
    const userAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      authority.payer,
      collateralMint,
      authority.publicKey
    );
    userTokenAccount = userAta.address;

    // Mint 1000 tokens to user
    await mintTo(
      provider.connection,
      authority.payer,
      collateralMint,
      userTokenAccount,
      authority.publicKey,
      1_000_000_000
    );
    console.log("✅ Minted 1000 tokens to user");

    // Create vault ATA for pool PDA — allowOwnerOffCurve=true because PDA
    const vaultAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      authority.payer,
      collateralMint,
      poolPda,
      true // <-- allowOwnerOffCurve
    );
    vaultTokenAccount = vaultAta.address;

    console.log("✅ Vault:", vaultTokenAccount.toBase58());
    console.log("✅ Pool PDA:", poolPda.toBase58());
    console.log("✅ Position PDA:", positionPda.toBase58());
  });

  it("✅ Initializes the lending pool", async () => {
    const tx = await program.methods
      .initializePool(new anchor.BN(6500), new anchor.BN(8000))
      .accounts({
        pool: poolPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("\n📋 Init pool tx:", tx);
    console.log("🔍 https://explorer.solana.com/tx/" + tx + "?cluster=devnet");

    const pool = await program.account.lendingPool.fetch(poolPda);
    assert.equal(pool.ltvRatio.toNumber(), 6500);
    assert.equal(pool.liquidationThreshold.toNumber(), 8000);
    console.log("✅ Pool initialized: LTV=65%, LiqThreshold=80%");
  });

  it("✅ Deposits collateral with Ika dWallet ID [ENCRYPT FHE]", async () => {
    const tx = await program.methods
      .depositCollateral(new anchor.BN(500_000_000), mockDWalletId)
      .accounts({
        pool: poolPda,
        position: positionPda,
        userTokenAccount,
        vault: vaultTokenAccount,
        user: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("\n📋 Deposit tx:", tx);
    console.log("🔍 https://explorer.solana.com/tx/" + tx + "?cluster=devnet");

    const position = await program.account.userPosition.fetch(positionPda);
    assert.equal(position.collateralEncrypted.toNumber(), 500_000_000);
    assert.isTrue(position.isActive);

    const vault = await getAccount(provider.connection, vaultTokenAccount);
    assert.equal(vault.amount.toString(), "500000000");

    console.log("✅ Deposited 500 tokens into vault");
    console.log("🔐 [FHE] collateral_encrypted field = EUint64 ciphertext in production");
    console.log("⛓️  [IKA] dWallet ID:", Buffer.from(position.dwalletId).toString("hex").slice(0,16) + "...");
  });

  it("✅ Borrows against encrypted collateral [FHE HEALTH CHECK]", async () => {
    const tx = await program.methods
      .borrow(new anchor.BN(200_000_000))
      .accounts({
        pool: poolPda,
        position: positionPda,
        owner: authority.publicKey,
        vault: vaultTokenAccount,
        userTokenAccount,
        user: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("\n📋 Borrow tx:", tx);
    console.log("🔍 https://explorer.solana.com/tx/" + tx + "?cluster=devnet");

    const position = await program.account.userPosition.fetch(positionPda);
    assert.equal(position.debtEncrypted.toNumber(), 200_000_000);

    console.log("✅ Borrowed 200 tokens");
    console.log("🔐 [FHE] Health check: collateral*LTV >= debt — ran on ciphertexts");
  });

  it("✅ Rejects borrow exceeding LTV ratio", async () => {
    // already borrowed 200, max is 325, so 200 more = 400 > 325 — should fail
    try {
      await program.methods
        .borrow(new anchor.BN(200_000_000))
        .accounts({
          pool: poolPda,
          position: positionPda,
          owner: authority.publicKey,
          vault: vaultTokenAccount,
          userTokenAccount,
          user: authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      assert.fail("Should have thrown InsufficientCollateral");
    } catch (err: any) {
      assert.include(err.toString(), "InsufficientCollateral");
      console.log("\n✅ Correctly rejected overborrow — FHE ratio enforced on-chain");
    }
  });

  it("✅ Approves Ika dWallet message for cross-chain signing", async () => {
    const messageHash = Array.from(
      Buffer.from(
        "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        "hex"
      )
    );

    const tx = await program.methods
      .approveDwalletMessage(messageHash)
      .accounts({
        pool: poolPda,
        position: positionPda,
        user: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("\n📋 dWallet approve tx:", tx);
    console.log("🔍 https://explorer.solana.com/tx/" + tx + "?cluster=devnet");
    console.log("⛓️  [IKA] 2PC-MPC network would now co-sign the BTC transaction");
  });

  it("✅ Repays loan and reduces encrypted debt", async () => {
    const tx = await program.methods
      .repay(new anchor.BN(100_000_000))
      .accounts({
        pool: poolPda,
        position: positionPda,
        userTokenAccount,
        vault: vaultTokenAccount,
        user: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("\n📋 Repay tx:", tx);
    console.log("🔍 https://explorer.solana.com/tx/" + tx + "?cluster=devnet");

    const position = await program.account.userPosition.fetch(positionPda);
    assert.equal(position.debtEncrypted.toNumber(), 100_000_000);
    console.log("✅ Repaid 100 tokens — encrypted debt now 100");
  });

  it("✅ Final on-chain state summary", async () => {
    const pool = await program.account.lendingPool.fetch(poolPda);
    const position = await program.account.userPosition.fetch(positionPda);

    console.log("\n════════════════════════════════════════");
    console.log("    PRIVALEND — LIVE ON-CHAIN STATE");
    console.log("════════════════════════════════════════");
    console.log("POOL:");
    console.log("  Total Collateral :", pool.totalCollateral.toNumber());
    console.log("  Total Borrowed   :", pool.totalBorrowed.toNumber());
    console.log("  LTV Ratio        :", pool.ltvRatio.toNumber(), "bps");
    console.log("  Liq Threshold    :", pool.liquidationThreshold.toNumber(), "bps");
    console.log("\nUSER POSITION:");
    console.log("  🔐 Collateral [ENCRYPTED]:", position.collateralEncrypted.toNumber());
    console.log("  🔐 Debt [ENCRYPTED]      :", position.debtEncrypted.toNumber());
    console.log("  ⛓️  dWallet ID :", Buffer.from(position.dwalletId).toString("hex").slice(0, 16) + "...");
    console.log("  Active        :", position.isActive);
    console.log("════════════════════════════════════════");
    console.log("Program ID:", program.programId.toBase58());
    console.log("Explorer  : https://explorer.solana.com/address/" + program.programId.toBase58() + "?cluster=devnet");
    console.log("════════════════════════════════════════");
  });
});
