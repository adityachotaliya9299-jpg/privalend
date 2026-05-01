use anchor_lang::prelude::*;

declare_id!("7WLWShzAzU747a5WVSTHJ7YUNPGPSyjewetJ5YfNA7Sb");

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

#[program]
pub mod privalend {
    use super::*;

    /// Initialize the global lending pool
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        ltv_ratio: u64,        // e.g. 6500 = 65%
        liquidation_threshold: u64, // e.g. 8000 = 80%
    ) -> Result<()> {
        instructions::initialize::handler(ctx, ltv_ratio, liquidation_threshold)
    }

    /// Deposit collateral and create an encrypted position
    /// Uses Encrypt FHE to store balance as ciphertext
    pub fn deposit_collateral(
        ctx: Context<DepositCollateral>,
        amount: u64,
        dwallet_id: [u8; 32],  // Ika dWallet identifier
    ) -> Result<()> {
        instructions::deposit::handler(ctx, amount, dwallet_id)
    }

    /// Borrow against encrypted collateral
    /// FHE checks collateral ratio without revealing amounts
    pub fn borrow(
        ctx: Context<Borrow>,
        borrow_amount: u64,
    ) -> Result<()> {
        instructions::borrow::handler(ctx, borrow_amount)
    }

    /// Repay loan and unlock collateral
    pub fn repay(
        ctx: Context<Repay>,
        repay_amount: u64,
    ) -> Result<()> {
        instructions::repay::handler(ctx, repay_amount)
    }

    /// Liquidate undercollateralized position
    /// FHE comparison: is health_factor < 1.0?
    pub fn liquidate(
        ctx: Context<Liquidate>,
        borrower: Pubkey,
    ) -> Result<()> {
        instructions::liquidate::handler(ctx, borrower)
    }

    /// Approve a dWallet message (called by Ika CPI)
    pub fn approve_dwallet_message(
        ctx: Context<ApproveDwalletMessage>,
        message_hash: [u8; 32],
    ) -> Result<()> {
        instructions::dwallet::handler(ctx, message_hash)
    }
}
