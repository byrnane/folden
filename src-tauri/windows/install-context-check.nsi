; User-level harness: private HKCU fixture and .cache files only. HKLM reads
; and Program Files path selection do not install anything.
; Compile from the repo: makensis src-tauri/windows/install-context-check.nsi
; Run .cache/installer-context-check.exe /S (exit 0), then /S /MODE=scope-reject
; (exit 2). The log is in .cache; real HKLM/UAC installation is a separate check.
Unicode true
Name "Folden Installer Context Check 4d7f3191"
OutFile "..\..\.cache\installer-context-check.exe"
InstallDir "$PROGRAMFILES64\Folden Installer Context Check 4d7f3191"
SilentInstall silent
!include MUI2.nsh
!include FileFunc.nsh
!include x64.nsh
!include "installer-hooks.nsh"
!define MULTIUSER_EXECUTIONLEVEL Standard
!define MULTIUSER_NOUNINSTALL
!define MULTIUSER_INSTALLMODE_INSTDIR "Folden Installer Context Check 4d7f3191"
!define MULTIUSER_USE_PROGRAMFILES64
!define MULTIUSER_INSTALLMODE_FUNCTION RestorePreviousInstallLocation
!include MultiUser.nsh
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Var FixturePath
Var FixtureLog
Var FixtureMode

Function .onInit
  SetRegView 64
  !insertmacro MULTIUSER_INIT
FunctionEnd

Function RestorePreviousInstallLocation
  Push $R0
  ReadRegStr $R0 SHCTX "Software\folden\$(^Name)" ""
  ${If} $R0 != ""
    StrCpy $INSTDIR $R0
  ${EndIf}
  Pop $R0
FunctionEnd

!macro AssertEqual ACTUAL EXPECTED
  ${If} "${ACTUAL}" != "${EXPECTED}"
    FileWrite $FixtureLog "FAIL: ${ACTUAL} != ${EXPECTED}$\r$\n"
    FileClose $FixtureLog
    SetErrorLevel 1
    Quit
  ${EndIf}
!macroend

Section "Context checks"
  StrCpy $FixturePath "$EXEDIR\installer-context-fixture\Custom directory"
  FileOpen $FixtureLog "$EXEDIR\installer-context-check.log" w
  ; Exercise native AllUsers path logic without elevation or HKLM writes.
  ; This is path-selection proof, not a Program Files installation.
  StrCpy $MultiUser.Privileges "Admin"
  Call MultiUser.InstallMode.AllUsers
  Call FoldenInitializeInstallContext
  !insertmacro AssertEqual $INSTDIR "$PROGRAMFILES64\Folden Installer Context Check 4d7f3191"
  !insertmacro AssertEqual $FoldenPreviousInstallScope ""
  FileWrite $FixtureLog "PASS: fresh AllUsers default is Program Files$\r$\n"
  CreateDirectory $FixturePath
  FileOpen $R0 "$FixturePath\app.exe" w
  FileClose $R0
  WriteRegStr HKCU "Software\folden\$(^Name)" "" $FixturePath
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$(^Name)" "UninstallString" "$FixturePath\uninstall.exe"
  Call FoldenInitializeInstallContext
  !insertmacro AssertEqual $MultiUser.InstallMode "CurrentUser"
  !insertmacro AssertEqual $INSTDIR $FixturePath
  !insertmacro AssertEqual $FoldenPreviousInstallScope "CurrentUser"
  Call FoldenKeepExistingInstallScope
  FileWrite $FixtureLog "PASS: legacy HKCU keeps scope and custom directory$\r$\n"
  ${GetParameters} $R0
  ${GetOptions} $R0 "/MODE=" $FixtureMode
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$(^Name)"
  ${If} $FixtureMode == "scope-reject"
    Call MultiUser.InstallMode.AllUsers
    DeleteRegKey HKCU "Software\folden\$(^Name)"
    Delete "$FixturePath\app.exe"
    RMDir $FixturePath
    RMDir "$EXEDIR\installer-context-fixture"
    FileWrite $FixtureLog "EXPECT: changing legacy scope aborts before install$\r$\n"
    FileClose $FixtureLog
    Call FoldenKeepExistingInstallScope
    SetErrorLevel 1
    Quit
  ${EndIf}
  Call MultiUser.InstallMode.AllUsers
  Call FoldenInitializeInstallContext
  !insertmacro AssertEqual $FoldenPreviousInstallScope ""
  !insertmacro AssertEqual $MultiUser.InstallMode "AllUsers"
  FileWrite $FixtureLog "PASS: orphan HKCU location does not select legacy scope$\r$\n"
  FileClose $FixtureLog
  DeleteRegKey HKCU "Software\folden\$(^Name)"
  Delete "$FixturePath\app.exe"
  RMDir $FixturePath
  RMDir "$EXEDIR\installer-context-fixture"
  SetErrorLevel 0
SectionEnd
