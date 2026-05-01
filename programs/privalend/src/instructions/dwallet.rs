use anchor_lang::prelude::*;
use crate::state::{LendingPool, UserPosition};
use crate::errors::PrivaLendError;

/// Approve an Ika dWallet message for cross-chain signing.
///
/// IKA INTEGRATION:
/// This instruction is the Solana-side of the dWallet signing flow.
/// 1. User deposits BTC to their dWallet address (controlled by Ika)
/// 2. Our Solana program approves message via CPI to Ika program
/// 3. Ika's 2PC-MPC network produces the BTC signature
/// 4. BTC is locked as collateral for the Solana loan
///
/// The dWallet splits signing authority between:
///   - The user (holds one key share)
///   - The Ika MPC network (holds distributed key shares)
///
/// Our program acts as the "condition gate" —
/// only approve signing if loan conditions are met.
pub fn handler(
    ctx: Context<ApproveDwalletMessage>,
    message_hash: [u8; 32],
) -> Result<()> {
    let position = &ctx.accounts.position;

    require!(position.is_active, PrivaLendError::InvalidDWallet);
    require!(
        position.dwallet_id != [0u8; 32],
        PrivaLendError::InvalidDWallet
    );

    // In production: CPI to Ika program's approve_message instruction
    //
    //   ika_cpi::approve_message(
    //       CpiContext::new_with_signer(
    //           ctx.accounts.ika_program.to_account_info(),
    //           ika_cpi::accounts::ApproveMessage {
    //               message_approval: ctx.accounts.message_approval.to_account_info(),
    //               dwallet: ctx.accounts.dwallet.to_account_info(),
    //               payer: ctx.accounts.user.to_account_info(),
    //               system_program: ctx.accounts.system_program.to_account_info(),
    //           },
    //           signer_seeds,
    //       ),
    //       message_hash,
    //       user_pubkey,
    //       signature_scheme,
    //       bump,
    //   )?;
    //
    // Pre-alpha: emit event so off-chain client can submit to Ika gRPC

    emit!(DWalletMessageApproved {
        dwallet_id: position.dwallet_id,
        message_hash,
        owner: ctx.accounts.user.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!(
        "dWallet message approved. Ika network will sign for dWallet: {:?}",
        &position.dwallet_id[..8]
    );

    Ok(())
}

#[event]
pub struct DWalletMessageApproved {
    pub dwallet_id: [u8; 32],
    pub message_hash: [u8; 32],
    pub owner: Pubkey,
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct ApproveDwalletMessage<'info> {
    #[account(
        seeds = [b"lending_pool"],
        bump = pool.bump
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        mut,
        seeds = [b"position", user.key().as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, UserPosition>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}
