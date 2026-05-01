use anchor_lang::prelude::*;
use crate::state::LendingPool;
use crate::errors::PrivaLendError;

pub fn handler(
    ctx: Context<InitializePool>,
    ltv_ratio: u64,
    liquidation_threshold: u64,
) -> Result<()> {
    require!(ltv_ratio < liquidation_threshold, PrivaLendError::InsufficientCollateral);
    require!(liquidation_threshold <= 10_000, PrivaLendError::InsufficientCollateral);

    let pool = &mut ctx.accounts.pool;
    pool.authority = ctx.accounts.authority.key();
    pool.ltv_ratio = ltv_ratio;
    pool.liquidation_threshold = liquidation_threshold;
    pool.total_collateral = 0;
    pool.total_borrowed = 0;
    pool.bump = ctx.bumps.pool;

    msg!("PrivaLend pool initialized. LTV: {}bps, Liq threshold: {}bps",
        ltv_ratio, liquidation_threshold);

    Ok(())
}

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = authority,
        space = LendingPool::LEN,
        seeds = [b"lending_pool"],
        bump
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}
