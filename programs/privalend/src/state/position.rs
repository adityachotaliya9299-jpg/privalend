use anchor_lang::prelude::*;

/// Per-user lending position
/// 
/// The collateral_encrypted and debt_encrypted fields simulate
/// Encrypt FHE ciphertexts — in production these would be
/// actual EUint64 ciphertexts computed via #[encrypt_fn].
/// On pre-alpha devnet they are stored as plaintext with the
/// FHE computation graph submitted off-chain to the executor.
#[account]
#[derive(Default)]
pub struct UserPosition {
    /// Owner of this position
    pub owner: Pubkey,

    /// Ika dWallet ID controlling cross-chain collateral
    /// This is the on-chain identifier of the dWallet
    /// whose signing is approved by this program via CPI
    pub dwallet_id: [u8; 32],

    /// [ENCRYPT FHE] Encrypted collateral amount
    /// In production: EUint64 ciphertext from encrypt-anchor
    /// Pre-alpha: stored as u64, FHE graph executed off-chain
    pub collateral_encrypted: u64,

    /// [ENCRYPT FHE] Encrypted debt amount
    pub debt_encrypted: u64,

    /// Ciphertext account reference for Encrypt executor
    /// Points to the on-chain ciphertext account managed
    /// by the Encrypt FHE cluster
    pub ciphertext_account: Pubkey,

    /// Timestamp of last interaction
    pub last_updated: i64,

    /// Whether this position is active
    pub is_active: bool,

    /// Position bump for PDA
    pub bump: u8,
}

impl UserPosition {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 32 + 8 + 1 + 1;
}
