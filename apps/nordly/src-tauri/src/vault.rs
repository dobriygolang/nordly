fn account(user_id: &str) -> Result<String, String> {
    let uid = user_id.trim();
    if uid.is_empty() {
        return Err("userId required".into());
    }
    Ok(format!("vault-passphrase:{uid}"))
}

pub fn load_passphrase(user_id: &str) -> Result<Option<String>, String> {
    Ok(crate::credentials::load(&account(user_id)?)?.filter(|raw| !raw.is_empty()))
}

pub fn save_passphrase(user_id: &str, passphrase: &str) -> Result<(), String> {
    if passphrase.trim().is_empty() {
        return Err("passphrase empty".into());
    }
    crate::credentials::save(&account(user_id)?, passphrase)
}

pub fn clear_passphrase(user_id: &str) -> Result<(), String> {
    crate::credentials::clear(&account(user_id)?)
}
