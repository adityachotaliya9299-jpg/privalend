use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{LendingPool, UserPosition};
use crate::errors::PrivaLendError;

pub fn handler(
    ctx: Context<DepositCollateral>,
    amount: u64,
    dwallet_id: [u8; 32],
) -> Result<()> {
    require!(amount > 0, PrivaLendError::ZeroAmount);

    // Transfer collateral tokens into the vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
    );
    token::transfer(cpi_ctx, amount)?;

    // Initialize or update user position
    let position = &mut ctx.accounts.position;
    let clock = Clock::get()?;

    if !position.is_active {
        // First deposit — initialize position
        position.owner = ctx.accounts.user.key();
        position.dwallet_id = dwallet_id;
        position.is_active = true;
        position.bump = ctx.bumps.position;
        position.ciphertext_account = ctx.accounts.user.key(); // placeholder
    }

    // [ENCRYPT FHE INTEGRATION POINT]
    // In production with Encrypt devnet:
    //   1. Client encrypts `amount` to EUint64 ciphertext
    //   2. Submits execute_graph CPI to Encrypt program
    //   3. Off-chain executor evaluates:
    //      #[encrypt_fn]
    //      fn add_collateral(existing: EUint64, new: EUint64) -> EUint64 {
    //          existing + new
    //      }
    //   4. Executor commits new ciphertext to ciphertext_account
    //
    // Pre-alpha: store plaintext (same API, just no real FHE yet)
    position.collateral_encrypted = position
        .collateral_encrypted
        .checked_add(amount)
        .ok_or(PrivaLendError::MathOverflow)?;

    position.last_updated = clock.unix_timestamp;

    // Update pool totals
    let pool = &mut ctx.accounts.pool;
    pool.total_collateral = pool
        .total_collateral
        .checked_add(amount)
        .ok_or(PrivaLendError::MathOverflow)?;

    msg!(
        "Deposited {} tokens. dWallet: {:?}. Encrypted collateral updated.",
        amount,
        &dwallet_id[..8]
    );

    Ok(())
}

#[derive(Accounts)]
pub struct DepositCollateral<'info> {
    #[account(
        mut,
        seeds = [b"lending_pool"],
        bump = pool.bump
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        init_if_needed,
        payer = user,
        space = UserPosition::LEN,
        seeds = [b"position", user.key().as_ref()],
        bump
    )]
    pub position: Account<'info, UserPosition>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
