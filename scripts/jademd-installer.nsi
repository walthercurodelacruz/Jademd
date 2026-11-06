Unicode True
!include "MUI2.nsh"
!include "x64.nsh"

Name "JadeMD"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\JadeMD"
InstallDirRegKey HKCU "Software\JadeMD" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma

!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\JadeMD"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${LICENSE_FILE}"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Spanish"

Function .onInit
    ${IfNot} ${RunningX64}
        MessageBox MB_ICONSTOP "JadeMD requiere Windows de 64 bits."
        Abort
    ${EndIf}
FunctionEnd

Section "JadeMD"
    SetOutPath "$INSTDIR\app"
    ClearErrors
    File /r "${APPDIR}/*"
    IfErrors 0 +3
    MessageBox MB_ICONSTOP "Cierra JadeMD antes de actualizar la aplicación."
    Abort
    SetOutPath "$INSTDIR"
    CreateDirectory "$SMPROGRAMS\JadeMD"
    CreateShortcut "$SMPROGRAMS\JadeMD\JadeMD.lnk" "$INSTDIR\app\JadeMD.exe"
    WriteUninstaller "$INSTDIR\Uninstall.exe"
    WriteRegStr HKCU "Software\JadeMD" "InstallDir" "$INSTDIR"
    WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "JadeMD"
    WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
    WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
    WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
    WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
    Delete "$SMPROGRAMS\JadeMD\JadeMD.lnk"
    RMDir "$SMPROGRAMS\JadeMD"
    RMDir /r "$INSTDIR\app"
    Delete "$INSTDIR\jademd.exe"
    Delete "$INSTDIR\LICENSE.txt"
    RMDir /r "$INSTDIR\frontend\dist"
    RMDir "$INSTDIR\frontend"
    Delete "$INSTDIR\Uninstall.exe"
    RMDir "$INSTDIR"
    DeleteRegKey HKCU "${UNINSTALL_KEY}"
    DeleteRegValue HKCU "Software\JadeMD" "InstallDir"
    DeleteRegKey /ifempty HKCU "Software\JadeMD"
SectionEnd
