#[cfg(target_os = "ios")]
use security_framework::access_control::{ProtectionMode, SecAccessControl};
use security_framework::passwords::{
    PasswordOptions, delete_generic_password_options, generic_password,
    set_generic_password_options,
};
use zeroize::Zeroizing;

const SERVICE: &str = "app.todalo.development.session";
const NOT_FOUND: i32 = -25300;

fn options(origin: &str) -> PasswordOptions {
    let mut options = PasswordOptions::new_generic_password(SERVICE, origin);
    options.set_access_synchronized(Some(false));
    // iOS always uses the data-protection keychain. macOS uses the login
    // keychain, whose app ACL supports local development without a team ID.
    options
}

pub fn read(origin: &str) -> Result<Option<Zeroizing<String>>, &'static str> {
    match generic_password(options(origin)) {
        Ok(bytes) => {
            let bytes = Zeroizing::new(bytes);
            let token = std::str::from_utf8(&bytes)
                .map_err(|_| "The saved credential is invalid. Sign out and try again.")?;
            Ok(Some(Zeroizing::new(token.to_owned())))
        }
        Err(error) if error.code() == NOT_FOUND => Ok(None),
        Err(_) => Err("Apple Keychain is unavailable. Unlock your device and try again."),
    }
}

pub fn write(origin: &str, token: &str) -> Result<(), &'static str> {
    let options = options(origin);
    #[cfg(target_os = "ios")]
    let options = {
        let mut options = options;
        options.set_access_control(
            SecAccessControl::create_with_protection(
                Some(ProtectionMode::AccessibleWhenUnlockedThisDeviceOnly),
                0,
            )
            .map_err(|_| "Cannot configure protected credential storage.")?,
        );
        options
    };
    set_generic_password_options(token.as_bytes(), options)
        .map_err(|_| "Your session could not be saved in Apple Keychain. Try again.")
}

pub fn clear(origin: &str) -> Result<(), &'static str> {
    match delete_generic_password_options(options(origin)) {
        Ok(()) => Ok(()),
        Err(error) if error.code() == NOT_FOUND => Ok(()),
        Err(_) => Err(
            "Your saved session could not be removed from Apple Keychain. Try signing out again.",
        ),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    #[ignore = "requires an unlocked Apple Keychain; uses only a synthetic credential"]
    fn apple_keychain_round_trip_and_removal() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let origin = format!("https://keychain-smoke-{unique}.example.invalid");
        let value = "synthetic-smoke-token.not-a-real-session";
        super::write(&origin, value).expect("Keychain write failed");
        let read = super::read(&origin);
        let clear = super::clear(&origin);
        assert_eq!(
            read.unwrap().as_deref().map(|value| value.as_str()),
            Some(value)
        );
        clear.expect("Synthetic Keychain credential cleanup failed");
        assert!(super::read(&origin).unwrap().is_none());
    }
}
