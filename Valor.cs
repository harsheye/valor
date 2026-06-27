using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace ValorTray
{
    static class Program
    {
        private static NotifyIcon trayIcon;
        private static ContextMenu trayMenu;
        private static Process serverProcess;
        private static string appDir;
        private static Mutex mutex;
        private static readonly string ServerPort = "5174";

        [STAThread]
        static void Main(string[] args)
        {
            appDir = AppDomain.CurrentDomain.BaseDirectory;

            // Enforce single instance of the tray app using a global mutex
            bool createdNew;
            mutex = new Mutex(true, "Global\\ValorPlayerMutex", out createdNew);

            string fileArg = "";
            bool playWithVlc = false;

            // Parse arguments
            foreach (string arg in args)
            {
                if (arg.Equals("--vlc", StringComparison.OrdinalIgnoreCase))
                {
                    playWithVlc = true;
                }
                else if (!arg.StartsWith("-"))
                {
                    fileArg = arg;
                }
            }

            if (!createdNew)
            {
                // Another instance is already running.
                // Just open the browser with the file argument (if any) and exit.
                OpenBrowser(fileArg, playWithVlc);
                return;
            }

            // Start the application tray
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            // Initialize Tray Menu
            trayMenu = new ContextMenu();
            trayMenu.MenuItems.Add("Open Valor", OnOpen);
            trayMenu.MenuItems.Add("-");
            trayMenu.MenuItems.Add("Exit", OnExit);

            // Load Tray Icon
            Icon appIcon = SystemIcons.Application;
            string iconPath = @"F:\data-img\Valor.ico";
            if (!File.Exists(iconPath))
            {
                iconPath = Path.Combine(appDir, "public", "logo.ico");
            }
            if (File.Exists(iconPath))
            {
                try
                {
                    appIcon = new Icon(iconPath);
                }
                catch {}
            }

            // Create Tray Icon
            trayIcon = new NotifyIcon();
            trayIcon.Text = "Valor Video Player";
            trayIcon.Icon = appIcon;
            trayIcon.ContextMenu = trayMenu;
            trayIcon.Visible = true;
            trayIcon.DoubleClick += OnOpen;

            // Start Node server in the background
            StartServer(args);

            // Give the background server a second to initialize and bind to the port
            Thread.Sleep(1000);

            // Open initial browser
            OpenBrowser(fileArg, playWithVlc);

            // Run the message loop
            Application.Run();
        }

        private static void StartServer(string[] args)
        {
            string exePath = Path.Combine(appDir, "start-app.exe");
            if (!File.Exists(exePath))
            {
                MessageBox.Show("Could not find start-app.exe in the application directory.", "Valor Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Application.Exit();
                return;
            }

            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = exePath;
            startInfo.Arguments = string.Join(" ", args);
            startInfo.CreateNoWindow = true;
            startInfo.UseShellExecute = false;
            startInfo.WindowStyle = ProcessWindowStyle.Hidden;
            startInfo.WorkingDirectory = appDir;

            try
            {
                serverProcess = Process.Start(startInfo);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to start the background server: " + ex.Message, "Valor Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Application.Exit();
            }
        }

        private static void OpenBrowser(string file, bool vlc)
        {
            if (vlc && !string.IsNullOrEmpty(file))
            {
                ProcessStartInfo vlcStart = new ProcessStartInfo();
                vlcStart.FileName = Path.Combine(appDir, "start-app.exe");
                vlcStart.Arguments = "--vlc \"" + file + "\"";
                vlcStart.CreateNoWindow = true;
                vlcStart.UseShellExecute = false;
                vlcStart.WindowStyle = ProcessWindowStyle.Hidden;
                try
                {
                    Process.Start(vlcStart);
                }
                catch {}
                return;
            }

            string url = "http://localhost:" + ServerPort;
            if (!string.IsNullOrEmpty(file))
            {
                url += "?file=" + Uri.EscapeDataString(file);
            }

            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true
                });
            }
            catch {}
        }

        private static void OnOpen(object sender, EventArgs e)
        {
            OpenBrowser("", false);
        }

        private static void OnExit(object sender, EventArgs e)
        {
            // Clean up tray icon
            if (trayIcon != null)
            {
                trayIcon.Visible = false;
                trayIcon.Dispose();
            }

            // Stop server process
            if (serverProcess != null && !serverProcess.HasExited)
            {
                try
                {
                    serverProcess.Kill();
                    serverProcess.Dispose();
                }
                catch {}
            }

            // Also kill any remaining start-app.exe processes to be clean
            try
            {
                foreach (var p in Process.GetProcessesByName("start-app"))
                {
                    p.Kill();
                }
            }
            catch {}

            if (mutex != null)
            {
                mutex.ReleaseMutex();
            }
            Application.Exit();
        }
    }
}
