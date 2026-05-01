use anchor_lang::prelude::*;

/// Global lending pool configuration
/// Stores protocol-level parameters
#[account]
#[derive(Default)]
pub struct LendingPool {
    /// Admin authority
    pub authority: Pubkey,

    /// Loan-to-value ratio in basis points (e.g. 6500 = 65%)
    pub ltv_ratio: u64,

    /// Liquidation threshold in basis points (e.g. 8000 = 80%)
    pub liquidation_threshold: u64,

    /// Total collateral deposited (in lamports / smallest unit)
    pub total_collateral: u64,

    /// Total amount borrowed (USDC in micro-units)
    pub total_borrowed: u64,

    /// Pool bump for PDA
    pub bump: u8,
}

impl LendingPool {
    // 8 discriminator + fields
    pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 8 + 1;
}
