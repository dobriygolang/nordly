use super::{Command, Snapshot, Status};
use windows::{
    core::{Error, Interface, Result, PWSTR},
    Media::Control::{
        GlobalSystemMediaTransportControlsSession as Session,
        GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
    },
    Win32::{
        Foundation::{CloseHandle, E_FAIL},
        Media::Audio::{
            eRender, AudioSessionStateExpired, IAudioSessionControl2, IAudioSessionManager2,
            IMMDeviceEnumerator, ISimpleAudioVolume, MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
        },
        System::{
            Com::{CoCreateInstance, CLSCTX_ALL},
            Threading::{
                OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
                PROCESS_QUERY_LIMITED_INFORMATION,
            },
            WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
        },
    },
};

struct Apartment;
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe {
            RoUninitialize();
        }
    }
}

pub fn execute(command: Command) -> Result<Snapshot> {
    unsafe {
        RoInitialize(RO_INIT_MULTITHREADED)?;
    }
    let _apartment = Apartment;
    let manager = Manager::RequestAsync()?.get()?;
    let sessions = manager.GetSessions()?;
    let mut spotify: Option<Session> = None;
    for session in sessions {
        let app = session
            .SourceAppUserModelId()?
            .to_string()
            .to_ascii_lowercase();
        // Spotify.exe for the direct installer; SpotifyAB.SpotifyMusic_... for Store.
        // Never use GetCurrentSession: it might be Chrome, Teams, or another player.
        if app == "spotify.exe" || app == "spotify" || app.starts_with("spotifyab.spotifymusic_") {
            spotify = Some(session);
            break;
        }
    }
    let Some(session) = spotify else {
        return Ok(Snapshot::empty(Status::NotRunning));
    };
    match command {
        Command::Playback(playing) => {
            let accepted = if playing {
                session.TryPlayAsync()?.get()?
            } else {
                session.TryPauseAsync()?.get()?
            };
            if !accepted {
                return Err(Error::new(E_FAIL, "Spotify rejected the playback command"));
            }
        }
        Command::Read { .. } | Command::Volume(_) => {}
    }
    let requested_volume = match command {
        Command::Volume(value) => Some(value),
        _ => None,
    };
    let volume = unsafe { spotify_volume(requested_volume)? };
    if requested_volume.is_some() && volume.is_none() {
        return Err(Error::new(
            E_FAIL,
            "Spotify has no local audio session. Play a track in the desktop app first.",
        ));
    }
    let properties = session.TryGetMediaPropertiesAsync()?.get()?;
    let playing = session.GetPlaybackInfo()?.PlaybackStatus()? == PlaybackStatus::Playing;
    Ok(Snapshot {
        status: Status::Ready,
        title: properties.Title()?.to_string(),
        artist: properties.Artist()?.to_string(),
        // SMTC exposes metadata, not a reliable Spotify URI. Don't guess IDs from titles.
        track_id: None,
        playing,
        volume,
    })
}

unsafe fn is_spotify_process(pid: u32) -> Result<bool> {
    if pid == 0 {
        return Ok(false);
    }
    let process = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
        Ok(process) => process,
        // Unrelated protected processes can appear in the mixer. They are not controllable Spotify.
        Err(error)
            if error.code() == windows::Win32::Foundation::E_ACCESSDENIED
                || error.code() == windows::core::HRESULT::from_win32(87) =>
        {
            return Ok(false)
        }
        Err(error) => return Err(error),
    };
    let mut path = vec![0u16; 32768];
    let mut size = path.len() as u32;
    let result = QueryFullProcessImageNameW(
        process,
        PROCESS_NAME_WIN32,
        PWSTR(path.as_mut_ptr()),
        &mut size,
    );
    let closed = CloseHandle(process);
    result?;
    closed?;
    Ok(String::from_utf16_lossy(&path[..size as usize])
        .rsplit('\\')
        .next()
        .is_some_and(|name| name.eq_ignore_ascii_case("Spotify.exe")))
}

unsafe fn spotify_volume(requested: Option<u8>) -> Result<Option<u8>> {
    let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
    let devices = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)?;
    let mut confirmed = None;
    // Spotify may be routed to a non-default output. Enumerate active outputs,
    // changing only non-expired audio sessions owned by Spotify.exe.
    for index in 0..devices.GetCount()? {
        let device = devices.Item(index)?;
        let manager: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None)?;
        let sessions = manager.GetSessionEnumerator()?;
        for index in 0..sessions.GetCount()? {
            let control = sessions.GetSession(index)?;
            if control.GetState()? == AudioSessionStateExpired {
                continue;
            }
            let control2: IAudioSessionControl2 = control.cast()?;
            if !is_spotify_process(control2.GetProcessId()?)? {
                continue;
            }
            let volume: ISimpleAudioVolume = control.cast()?;
            if let Some(percent) = requested {
                volume.SetMasterVolume(f32::from(percent) / 100.0, std::ptr::null())?;
            }
            let value = (volume.GetMasterVolume()? * 100.0).round() as u8;
            confirmed = Some(value);
        }
    }
    Ok(confirmed)
}
