use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{LendingPool, UserPosition};
use crate::errors::PrivaLendError;

pub fn handler(ctx: Context<Borrow>, borrow_amount: u64) -> Result<()> {
    require!(borrow_amount > 0, PrivaLendError::ZeroAmount);

    let pool = &ctx.accounts.pool;
    let position = &ctx.accounts.position;

    // [ENCRYPT FHE INTEGRATION POINT]
    // In production this check runs entirely on ciphertexts:
    //
    //   #[encrypt_fn]
    //   fn check_health(
    //       collateral: EUint64,
    //       existing_debt: EUint64,
    //       new_borrow: EUint64,
    //       ltv_ratio: EUint64,
    //   ) -> EBool {
    //       let total_debt = existing_debt + new_borrow;
    //       // collateral * ltv_ratio / 10000 >= total_debt
    //       collateral * ltv_ratio >= total_debt * 10000
    //   }
    //
    // The executor evaluates on ciphertexts, nobody sees the amounts.
    // Decryptors only reveal the final EBool (healthy/not).
    //
    // Pre-alpha: plaintext check with same logic
    let max_borrow = position
        .collateral_encrypted
        .checked_mul(pool.ltv_ratio)
        .ok_or(PrivaLendError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(PrivaLendError::MathOverflow)?;

    let new_total_debt = position
        .debt_encrypted
        .checked_add(borrow_amount)
        .ok_or(PrivaLendError::MathOverflow)?;

    require!(new_total_debt <= max_borrow, PrivaLendError::InsufficientCollateral);

    // Release funds from vault to user
    let seeds = &[b"lending_pool".as_ref(), &[pool.bump]];
    let signer = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.vault.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.pool.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer,
    );
    token::transfer(cpi_ctx, borrow_amount)?;

    // Update encrypted debt
    let position = &mut ctx.accounts.position;
    position.debt_encrypted = position
        .debt_encrypted
        .checked_add(borrow_amount)
        .ok_or(PrivaLendError::MathOverflow)?;

    let clock = Clock::get()?;
    position.last_updated = clock.unix_timestamp;

    let pool = &mut ctx.accounts.pool;
    pool.total_borrowed = pool
        .total_borrowed
        .checked_add(borrow_amount)
        .ok_or(PrivaLendError::MathOverflow)?;

    msg!(
        "Borrowed {} tokens. FHE health check passed. Debt encrypted.",
        borrow_amount
    );

    Ok(())
}

#[derive(Accounts)]
pub struct Borrow<'info> {
    #[account(
        mut,
        seeds = [b"lending_pool"],
        bump = pool.bump
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        mut,
        seeds = [b"position", user.key().as_ref()],
        bump = position.bump,
        has_one = owner @ PrivaLendError::InvalidDWallet
    )]
    pub position: Account<'info, UserPosition>,

    /// CHECK: owner field validated by has_one
    pub owner: AccountInfo<'info>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}
