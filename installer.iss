[Setup]
AppName=Valor
AppVersion=1.0
DefaultDirName={pf}\Valor
DefaultGroupName=Valor
OutputDir=.
OutputBaseFilename=ValorSetup
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayIcon={app}\Valor.exe

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"

[Files]
Source: "Valor.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "start.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "start-app.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "node.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\*"; DestDir: "{app}\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Valor"; Filename: "{app}\Valor.exe"
Name: "{group}\Uninstall Valor"; Filename: "{uninstallexe}"
Name: "{commondesktop}\Valor"; Filename: "{app}\Valor.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Valor.exe"; Description: "Launch Valor"; Flags: nowait postinstall skipifsilent
