use anchor_lang::prelude::*;

#[error_code]
pub enum PrivaLendError {
    #[msg("Collateral ratio too low to borrow")]
    InsufficientCollateral,

    #[msg("Position is healthy, cannot liquidate")]
    PositionHealthy,

    #[msg("Repay amount exceeds debt")]
    OverRepayment,

    #[msg("Pool already initialized")]
    AlreadyInitialized,

    #[msg("Invalid dWallet ID")]
    InvalidDWallet,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Zero amount not allowed")]
    ZeroAmount,
}
