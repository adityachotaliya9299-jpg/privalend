use anchor_lang::prelude::*;

declare_id!("7WLWShzAzU747a5WVSTHJ7YUNPGPSyjewetJ5YfNA7Sb");

#[program]
pub mod privalend {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
