use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{LendingPool, UserPosition};
use crate::errors::PrivaLendError;

pub fn handler(ctx: Context<Repay>, repay_amount: u64) -> Result<()> {
    require!(repay_amount > 0, PrivaLendError::ZeroAmount);

    let position = &ctx.accounts.position;
    require!(
        repay_amount <= position.debt_encrypted,
        PrivaLendError::OverRepayment
    );

    // Transfer repayment from user back to vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
    );
    token::transfer(cpi_ctx, repay_amount)?;

    // [ENCRYPT FHE INTEGRATION POINT]
    // #[encrypt_fn]
    // fn reduce_debt(debt: EUint64, repaid: EUint64) -> EUint64 {
    //     debt - repaid
    // }
    let position = &mut ctx.accounts.position;
    position.debt_encrypted = position
        .debt_encrypted
        .checked_sub(repay_amount)
        .ok_or(PrivaLendError::MathOverflow)?;

    let clock = Clock::get()?;
    position.last_updated = clock.unix_timestamp;

    let pool = &mut ctx.accounts.pool;
    pool.total_borrowed = pool
        .total_borrowed
        .checked_sub(repay_amount)
        .ok_or(PrivaLendError::MathOverflow)?;

    msg!("Repaid {} tokens. Encrypted debt reduced.", repay_amount);

    Ok(())
}

#[derive(Accounts)]
pub struct Repay<'info> {
    #[account(
        mut,
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
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}
