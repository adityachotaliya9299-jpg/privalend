#![allow(ambiguous_glob_reexports)]
use anchor_lang::prelude::*;

declare_id!("7WLWShzAzU747a5WVSTHJ7YUNPGPSyjewetJ5YfNA7Sb");

pub mod errors;
pub mod instructions;
pub mod state;

// Re-export everything from each instruction module to crate root.
// Anchor's #[program] macro needs __client_accounts_* types here.
pub use instructions::initialize::*;
pub use instructions::deposit::*;
pub use instructions::borrow::*;
pub use instructions::repay::*;
pub use instructions::liquidate::*;
pub use instructions::dwallet::*;

#[program]
pub mod privalend {
    use super::*;

    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        ltv_ratio: u64,
        liquidation_threshold: u64,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, ltv_ratio, liquidation_threshold)
    }

    pub fn deposit_collateral(
        ctx: Context<DepositCollateral>,
        amount: u64,
        dwallet_id: [u8; 32],
    ) -> Result<()> {
        instructions::deposit::handler(ctx, amount, dwallet_id)
    }

    pub fn borrow(
        ctx: Context<Borrow>,
        borrow_amount: u64,
    ) -> Result<()> {
        instructions::borrow::handler(ctx, borrow_amount)
    }

    pub fn repay(
        ctx: Context<Repay>,
        repay_amount: u64,
    ) -> Result<()> {
        instructions::repay::handler(ctx, repay_amount)
    }

    pub fn liquidate(
        ctx: Context<Liquidate>,
        borrower: Pubkey,
    ) -> Result<()> {
        instructions::liquidate::handler(ctx, borrower)
    }

    pub fn approve_dwallet_message(
        ctx: Context<ApproveDwalletMessage>,
        message_hash: [u8; 32],
    ) -> Result<()> {
        instructions::dwallet::handler(ctx, message_hash)
    }
}
