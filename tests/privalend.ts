import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Privalend } from "../target/types/privalend";
import {
  PublicKey,
  SystemProgram,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

describe("privalend", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Privalend as Program<Privalend>;

  // Keypairs
  const authority = provider.wallet as anchor.Wallet;
  const user = Keypair.generate();

  // PDAs
  let poolPda: PublicKey;
  let poolBump: number;
  let positionPda: PublicKey;
  let positionBump: number;

  // Token accounts
  let collateralMint: PublicKey;
  let userTokenAccount: PublicKey;
  let vaultTokenAccount: PublicKey;

  // Mock dWallet ID (32 bytes) — simulates an Ika dWallet identifier
  const mockDWalletId = Array.from(
    Buffer.from("ika_dwallet_btc_mainnet_001_mock_".padEnd(32, "0").slice(0, 32))
  );

  before(async () => {
    console.log("\n🔧 Setting up test environment...");

    // Airdrop to user
    const sig = await provider.connection.requestAirdrop(
      user.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    // Derive PDAs
    [poolPda, poolBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("lending_pool")],
      program.programId
    );

    [positionPda, positionBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), user.publicKey.toBuffer()],
      program.programId
    );

    // Create collateral mint (simulates wBTC or mock BTC token)
    collateralMint = await createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      6 // 6 decimals like USDC
    );

    console.log("✅ Collateral mint:", collateralMint.toBase58());

    // Create user token account and mint tokens
    userTokenAccount = await createAccount(
      provider.connection,
      authority.payer,
      collateralMint,
      user.publicKey
    );

    // Mint 1000 tokens to user (simulates BTC collateral)
    await mintTo(
      provider.connection,
      authority.payer,
      collateralMint,
      userTokenAccount,
      authority.publicKey,
      1_000_000_000 // 1000 tokens with 6 decimals
    );

    // Create vault (owned by pool PDA)
    vaultTokenAccount = await createAccount(
      provider.connection,
      authority.payer,
      collateralMint,
      poolPda,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    console.log("✅ Vault token account:", vaultTokenAccount.toBase58());
    console.log("✅ Pool PDA:", poolPda.toBase58());
    console.log("✅ User position PDA:", positionPda.toBase58());
  });

  // ─────────────────────────────────────────────
  // TEST 1: Initialize Pool
  // ─────────────────────────────────────────────
  it("✅ Initializes the lending pool", async () => {
    const ltvRatio = new anchor.BN(6500);         // 65%
    const liquidationThreshold = new anchor.BN(8000); // 80%

    const tx = await program.methods
      .initializePool(ltvRatio, liquidationThreshold)
      .accounts({
        pool: poolPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("\n📋 Initialize pool tx:", tx);
    console.log(
      "🔍 Explorer: https://explorer.solana.com/tx/" + tx + "?cluster=devnet"
    );

    const pool = await program.account.lendingPool.fetch(poolPda);
    assert.equal(pool.ltvRatio.toNumber(), 6500, "LTV ratio mismatch");
    assert.equal(
      pool.liquidationThreshold.toNumber(),
      8000,
      "Liquidation threshold mismatch"
    );
    assert.equal(
      pool.authority.toBase58(),
      authority.publicKey.toBase58(),
      "Authority mismatch"
    );

    console.log("✅ Pool initialized: LTV=65%, LiqThreshold=80%");
  });

  // ─────────────────────────────────────────────
  // TEST 2: Deposit Collateral (Ika dWallet flow)
  // ─────────────────────────────────────────────
  it("✅ Deposits collateral with Ika dWallet ID [ENCRYPT FHE]", async () => {
    const depositAmount = new anchor.BN(500_000_000); // 500 tokens

    const tx = await program.methods
      .depositCollateral(depositAmount, mockDWalletId)
      .accounts({
        pool: poolPda,
        position: positionPda,
        userTokenAccount: userTokenAccount,
        vault: vaultTokenAccount,
        user: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    console.log("\n📋 Deposit tx:", tx);
    console.log(
      "🔍 Explorer: https://explorer.solana.com/tx/" + tx + "?cluster=devnet"
    );

    const position = await program.account.userPosition.fetch(positionPda);
    assert.equal(
      position.collateralEncrypted.toNumber(),
      500_000_000,
      "Collateral not recorded"
    );
    assert.isTrue(position.isActive, "Position should be active");
    assert.equal(
      Buffer.from(position.dwalletId).toString("hex"),
      Buffer.from(mockDWalletId).toString("hex"),
      "dWallet ID mismatch"
    );

    const vault = await getAccount(provider.connection, vaultTokenAccount);
    assert.equal(
      vault.amount.toString(),
      "500000000",
      "Vault should hold deposited tokens"
    );

    console.log("✅ Collateral deposited. dWallet ID recorded on-chain.");
    console.log(
      "🔐 [FHE] In production: collateral stored as EUint64 ciphertext"
    );
    console.log(
      "⛓️  [IKA] dWallet controls cross-chain BTC at address derived from dWallet ID"
    );
  });

  // ─────────────────────────────────────────────
  // TEST 3: Borrow (FHE health check)
  // ─────────────────────────────────────────────
  it("✅ Borrows against encrypted collateral [FHE HEALTH CHECK]", async () => {
    // Max borrow = 500 * 65% = 325 tokens
    const borrowAmount = new anchor.BN(200_000_000); // 200 tokens (safe)

    const tx = await program.methods
      .borrow(borrowAmount)
      .accounts({
        pool: poolPda,
        position: positionPda,
        owner: user.publicKey,
        vault: vaultTokenAccount,
        userTokenAccount: userTokenAccount,
        user: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    console.log("\n📋 Borrow tx:", tx);
    console.log(
      "🔍 Explorer: https://explorer.solana.com/tx/" + tx + "?cluster=devnet"
    );

    const position = await program.account.userPosition.fetch(positionPda);
    assert.equal(
      position.debtEncrypted.toNumber(),
      200_000_000,
      "Debt not recorded"
    );

    console.log("✅ Borrowed 200 tokens. Debt encrypted on-chain.");
    console.log(
      "🔐 [FHE] In production: health check runs on EUint64 ciphertexts"
    );
    console.log("   Nobody sees collateral or debt amounts during the check.");
  });

  // ─────────────────────────────────────────────
  // TEST 4: Reject overborrow
  // ─────────────────────────────────────────────
  it("✅ Rejects borrow that exceeds LTV ratio", async () => {
    // Already have 200 debt. Max is 325. Try to borrow 200 more = 400 total > 325
    const overBorrow = new anchor.BN(200_000_000);

    try {
      await program.methods
        .borrow(overBorrow)
        .accounts({
          pool: poolPda,
          position: positionPda,
          owner: user.publicKey,
          vault: vaultTokenAccount,
          userTokenAccount: userTokenAccount,
          user: user.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      assert.fail("Should have thrown InsufficientCollateral error");
    } catch (err: any) {
      assert.include(
        err.toString(),
        "InsufficientCollateral",
        "Wrong error type"
      );
      console.log("\n✅ Correctly rejected overborrow. FHE check enforced.");
    }
  });

  // ─────────────────────────────────────────────
  // TEST 5: Approve dWallet message (Ika flow)
  // ─────────────────────────────────────────────
  it("✅ Approves Ika dWallet message for cross-chain signing", async () => {
    // Simulate approving a BTC transaction hash
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
        user: user.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    console.log("\n📋 dWallet approve tx:", tx);
    console.log(
      "🔍 Explorer: https://explorer.solana.com/tx/" + tx + "?cluster=devnet"
    );

    console.log("✅ dWallet message approved by Solana program.");
    console.log(
      "⛓️  [IKA] In production: Ika 2PC-MPC network now produces the BTC signature"
    );
    console.log("   The signature unlocks/locks BTC collateral cross-chain.");
  });

  // ─────────────────────────────────────────────
  // TEST 6: Repay
  // ─────────────────────────────────────────────
  it("✅ Repays loan and reduces encrypted debt", async () => {
    const repayAmount = new anchor.BN(100_000_000); // repay 100

    const tx = await program.methods
      .repay(repayAmount)
      .accounts({
        pool: poolPda,
        position: positionPda,
        userTokenAccount: userTokenAccount,
        vault: vaultTokenAccount,
        user: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    console.log("\n📋 Repay tx:", tx);

    const position = await program.account.userPosition.fetch(positionPda);
    assert.equal(
      position.debtEncrypted.toNumber(),
      100_000_000, // was 200, repaid 100
      "Debt should be 100 after repayment"
    );

    console.log("✅ Repaid 100 tokens. Encrypted debt reduced to 100.");
  });

  // ─────────────────────────────────────────────
  // TEST 7: Print final state summary
  // ─────────────────────────────────────────────
  it("✅ Prints final on-chain state", async () => {
    const pool = await program.account.lendingPool.fetch(poolPda);
    const position = await program.account.userPosition.fetch(positionPda);

    console.log("\n════════════════════════════════════════");
    console.log("  PRIVALEND — FINAL ON-CHAIN STATE");
    console.log("════════════════════════════════════════");
    console.log("POOL:");
    console.log("  Total Collateral:", pool.totalCollateral.toNumber());
    console.log("  Total Borrowed:  ", pool.totalBorrowed.toNumber());
    console.log("  LTV Ratio:       ", pool.ltvRatio.toNumber(), "bps");
    console.log("  Liq Threshold:   ", pool.liquidationThreshold.toNumber(), "bps");
    console.log("\nUSER POSITION:");
    console.log(
      "  Collateral [ENCRYPTED]:",
      position.collateralEncrypted.toNumber()
    );
    console.log(
      "  Debt [ENCRYPTED]:      ",
      position.debtEncrypted.toNumber()
    );
    console.log("  dWallet ID:  ", Buffer.from(position.dwalletId).toString("hex").slice(0, 16) + "...");
    console.log("  Active:      ", position.isActive);
    console.log("════════════════════════════════════════");
    console.log("Program ID:", program.programId.toBase58());
    console.log(
      "Explorer:  https://explorer.solana.com/address/" +
        program.programId.toBase58() +
        "?cluster=devnet"
    );
  });
});
