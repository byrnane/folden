; Tauri includes this file before its product defines and MultiUser.nsh.
; GUI initialization follows .onInit, before the scope and maintenance pages.
!define MUI_CUSTOMFUNCTION_GUIINIT FoldenInitializeInstallContext
!define MULTIUSER_PAGE_CUSTOMFUNCTION_LEAVE FoldenKeepExistingInstallScope

Var FoldenPreviousInstallScope

Function FoldenInitializeInstallContext
  Push $R0
  Push $R1
  Push $R2
  StrCpy $FoldenPreviousInstallScope ""
  ; Product defines and MultiUser variables are unavailable at this include
  ; point. Use Tauri's existing publisher key and the runtime product name.
  ; An uninstall record identifies the scope; broken binaries can be repaired.
  ReadRegStr $R0 HKLM "Software\folden\$(^Name)" ""
  ReadRegStr $R2 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\$(^Name)" "UninstallString"
  ${If} $R2 == ""
    StrCpy $R0 ""
  ${EndIf}
  ReadRegStr $R1 HKCU "Software\folden\$(^Name)" ""
  ReadRegStr $R2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$(^Name)" "UninstallString"
  ${If} $R2 == ""
    StrCpy $R1 ""
  ${EndIf}
  ; Machine installation wins if both scopes already exist. Native MultiUser
  ; callbacks restore the registered custom directory for the chosen scope.
  ${If} $R0 != ""
    StrCpy $FoldenPreviousInstallScope "AllUsers"
    Call MultiUser.InstallMode.AllUsers
  ${ElseIf} $R1 != ""
    Call MultiUser.InstallMode.CurrentUser
    StrCpy $FoldenPreviousInstallScope "CurrentUser"
  ${EndIf}
  Pop $R2
  Pop $R1
  Pop $R0
  Call FoldenKeepExistingInstallScope
FunctionEnd

Function FoldenKeepExistingInstallScope
  Push $R0
  Push $R1
  ; The native context distinguishes ownership even when hive paths match.
  IfShellVarContextAll 0 +3
    StrCpy $R0 "AllUsers"
    Goto +2
    StrCpy $R0 "CurrentUser"
  ${If} $FoldenPreviousInstallScope != ""
    ${If} $R0 != $FoldenPreviousInstallScope
      ${If} $LANGUAGE == 1049
        StrCpy $R0 "Удалите предыдущую установку $(^Name), чтобы изменить область установки. Сохраните пользовательские данные при удалении."
      ${Else}
        StrCpy $R0 "Uninstall the existing $(^Name) installation before changing its scope. Keep your user data when uninstalling."
      ${EndIf}
      UserInfo::GetAccountType
      Pop $R1
      ${If} $R1 != "Admin"
      ${AndIf} $R1 != "Power"
        ${If} $LANGUAGE == 1049
          StrCpy $R0 "Для обновления системной установки $(^Name) запустите установщик с правами администратора."
        ${Else}
          StrCpy $R0 "Run this installer as administrator to update the system installation of $(^Name)."
        ${EndIf}
      ${EndIf}
      MessageBox MB_OK|MB_ICONEXCLAMATION $R0 /SD IDOK
      Pop $R1
      Pop $R0
      Abort
    ${EndIf}
  ${EndIf}
  Pop $R1
  Pop $R0
FunctionEnd

; .onGUIInit is not called by /S. This early hidden section precedes Tauri's
; WebView installation, maintenance checks, SetOutPath and application writes.
Section "-FoldenInstallContext"
  IfSilent 0 +2
    Call FoldenInitializeInstallContext
  Call FoldenKeepExistingInstallScope
SectionEnd
