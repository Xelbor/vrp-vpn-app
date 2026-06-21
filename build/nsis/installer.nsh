!macro customInit
  ; --- Migration from old VRP VPN (Tauri) app ---

  ; Force current user context to resolve $APPDATA correctly
  ; (perMachine installers may default to all-users context)
  SetShellVarContext current

  ; Check if old profiles.yaml exists and back it up
  ; Try Roaming AppData first, then Local AppData as fallback
  IfFileExists "$APPDATA\io.github.vrp-vpn\profiles.yaml" 0 check_localappdata
    CopyFiles /SILENT "$APPDATA\io.github.vrp-vpn\profiles.yaml" "$TEMP\vrp-vpn-migration-profiles.yaml"
    Goto backup_done
  check_localappdata:
  IfFileExists "$LOCALAPPDATA\io.github.vrp-vpn\profiles.yaml" 0 backup_done
    CopyFiles /SILENT "$LOCALAPPDATA\io.github.vrp-vpn\profiles.yaml" "$TEMP\vrp-vpn-migration-profiles.yaml"
  backup_done:

  ; Try to find and run the old uninstaller
  ; Check Program Files locations first
  IfFileExists "$PROGRAMFILES\VRP VPN\uninstall.exe" 0 check_programfiles64
    ExecWait '"$PROGRAMFILES\VRP VPN\uninstall.exe" /S _?=$PROGRAMFILES\VRP VPN'
    Goto uninstall_done
  check_programfiles64:
  IfFileExists "$PROGRAMFILES64\VRP VPN\uninstall.exe" 0 check_registry
    ExecWait '"$PROGRAMFILES64\VRP VPN\uninstall.exe" /S _?=$PROGRAMFILES64\VRP VPN'
    Goto uninstall_done

  ; Fallback: check registry for uninstall string
  check_registry:
    ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\VRP VPN" "UninstallString"
    StrCmp $0 "" check_registry_user run_registry_uninstaller
  check_registry_user:
    ReadRegStr $0 HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\VRP VPN" "UninstallString"
    StrCmp $0 "" uninstall_done run_registry_uninstaller
  run_registry_uninstaller:
    ExecWait '"$0" /S'

  uninstall_done:

  ; Restore context for the rest of the installer
  SetShellVarContext all
!macroend

!macro customInstall
  ; --- Copy migration file to new app data directory ---
  SetShellVarContext current
  IfFileExists "$TEMP\vrp-vpn-migration-profiles.yaml" 0 no_migration_file
    CreateDirectory "$APPDATA\VRP-VPN"
    CopyFiles /SILENT "$TEMP\vrp-vpn-migration-profiles.yaml" "$APPDATA\VRP-VPN\.migration-profiles.yaml"
    Delete "$TEMP\vrp-vpn-migration-profiles.yaml"
  no_migration_file:
  SetShellVarContext all
!macroend
