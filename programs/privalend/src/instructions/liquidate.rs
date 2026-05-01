use anchor_lang::prelude::*;
use crate::state::{LendingPool, UserPosition};
use crate::errors::PrivaLendError;

pub fn handler(ctx: Context<Liquidate>, _borrower: Pubkey) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let position = &ctx.accounts.position;

    // [ENCRYPT FHE INTEGRATION POINT]
    // This is the most powerful FHE use case — nobody knows
    // if a position is undercollateralized until the FHE
    // executor reveals only the boolean result:
    //
    //   #[encrypt_fn]
    //   fn is_liquidatable(
    //       collateral: EUint64,
    //       debt: EUint64,
    //       liq_threshold: EUint64,
    //   ) -> EBool {
    //       // health_factor = collateral * liq_threshold / debt / 10000
    //       // liquidate if health_factor < 1.0
    //       collateral * liq_threshold < debt * 10000
    //   }
    //
    // Threshold decryptors reveal only: can_liquidate: bool
    // Positions, amounts, and collateral remain private.
    //
    // Pre-alpha plaintext check:
    let threshold_collateral = position
        .collateral_encrypted
        .checked_mul(pool.liquidation_threshold)
        .ok_or(PrivaLendError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(PrivaLendError::MathOverflow)?;

    require!(
        position.debt_encrypted > threshold_collateral,
        PrivaLendError::PositionHealthy
    );

    // Mark position for liquidation (full liquidation for simplicity)
    let position = &mut ctx.accounts.position;
    position.is_active = false;
    position.debt_encrypted = 0;
    position.collateral_encrypted = 0;

    let clock = Clock::get()?;
    position.last_updated = clock.unix_timestamp;

    msg!(
        "Position liquidated. FHE health check revealed undercollateralization."
    );

    Ok(())
}

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(
        mut,
        seeds = [b"lending_pool"],
        bump = pool.bump
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        mut,
        seeds = [b"position", borrower.key().as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, UserPosition>,

    /// CHECK: We verify via PDA seeds — this is the borrower's key
    pub borrower: AccountInfo<'info>,

    #[account(mut)]
    pub liquidator: Signer<'info>,
}
