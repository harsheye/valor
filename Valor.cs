using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace ValorTray
{
    static class Program
    {
        private static NotifyIcon trayIcon;
        private static Process serverProcess;
        private static string appDir;
        private static Mutex mutex;
        private static readonly string ServerPort = "50000";

        [STAThread]
        static void Main(string[] args)
        {
            appDir = AppDomain.CurrentDomain.BaseDirectory;

            // Enforce single instance of the tray app using a global mutex
            bool createdNew;
            mutex = new Mutex(true, "Global\\ValorPlayerMutex", out createdNew);

            string fileArg = "";

            // Parse arguments
            foreach (string arg in args)
            {
                if (arg.Equals("--vlc", StringComparison.OrdinalIgnoreCase))
                {
                    // Handled directly by start.bat
                }
                else if (!arg.StartsWith("-"))
                {
                    fileArg = arg;
                }
            }

            string port = ServerPort;
            try
            {
                string portFilePath = Path.Combine(appDir, ".valor_data", "active_port.txt");
                if (File.Exists(portFilePath))
                {
                    string filePort = File.ReadAllText(portFilePath).Trim();
                    if (!string.IsNullOrEmpty(filePort))
                    {
                        port = filePort;
                    }
                }
            }
            catch {}

            if (!createdNew)
            {
                // Another tray instance is running. Try to reuse the running server.
                if (SendPlayRequest(fileArg, port))
                {
                    return;
                }
                // Server is dead. Start a new server process and exit.
                StartServer(args);
                return;
            }

            // Start the application tray
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            // Initialize Tray Menu with modern dark theme and rounded corners
            ContextMenuStrip contextMenu = new ContextMenuStrip();
            contextMenu.BackColor = Color.FromArgb(15, 15, 15);
            contextMenu.ForeColor = Color.White;
            contextMenu.ShowImageMargin = false;
            contextMenu.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
            contextMenu.Renderer = new DarkRenderer();

            var openItem = new ToolStripMenuItem("Open Valor", null, OnOpen);
            openItem.ForeColor = Color.White;
            
            var logsItem = new ToolStripMenuItem("View Logs", null, OnViewLogs);
            logsItem.ForeColor = Color.White;

            var exitItem = new ToolStripMenuItem("Exit", null, OnExit);
            exitItem.ForeColor = Color.White;

            contextMenu.Items.Add(openItem);
            contextMenu.Items.Add(new ToolStripSeparator());
            contextMenu.Items.Add(logsItem);
            contextMenu.Items.Add(new ToolStripSeparator());
            contextMenu.Items.Add(exitItem);

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
            trayIcon.ContextMenuStrip = contextMenu;
            trayIcon.Visible = true;
            trayIcon.DoubleClick += OnOpen;

            // Start Node server in the background
            StartServer(args);

            // Browser launching on startup is handled by the server (start.bat) to prevent double tabs

            // Run the message loop
            Application.Run();
        }

        private static bool SendPlayRequest(string file, string port)
        {
            try
            {
                string url = "http://127.0.0.1:50001/api/play";
                if (!string.IsNullOrEmpty(file))
                {
                    url += "?file=" + Uri.EscapeDataString(file);
                }
                var request = (HttpWebRequest)WebRequest.Create(url);
                request.Method = "GET";
                request.Timeout = 1500;
                using (var response = (HttpWebResponse)request.GetResponse())
                {
                    return response.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        private static void StartServer(string[] args)
        {
            string exePath = Path.Combine(appDir, "start.bat");
            if (!File.Exists(exePath))
            {
                MessageBox.Show("Could not find start.bat in the application directory.", "Valor Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Application.Exit();
                return;
            }

            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = exePath;
            
            // Append --tray argument
            System.Collections.Generic.List<string> serverArgs = new System.Collections.Generic.List<string>(args);
            if (!serverArgs.Contains("--tray"))
            {
                serverArgs.Add("--tray");
            }
            startInfo.Arguments = string.Join(" ", serverArgs.ToArray());

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

        private static void OpenBrowser(string file, bool vlc, string customPort = null)
        {
            if (vlc && !string.IsNullOrEmpty(file))
            {
                ProcessStartInfo vlcStart = new ProcessStartInfo();
                vlcStart.FileName = Path.Combine(appDir, "start.bat");
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

            string port = customPort;
            if (string.IsNullOrEmpty(port))
            {
                port = ServerPort;
                try
                {
                    string portFilePath = Path.Combine(appDir, ".valor_data", "active_port.txt");
                    if (File.Exists(portFilePath))
                    {
                        string filePort = File.ReadAllText(portFilePath).Trim();
                        if (!string.IsNullOrEmpty(filePort))
                        {
                            port = filePort;
                        }
                    }
                }
                catch {}
            }

            string url = "http://127.0.0.1:" + port;
            if (!string.IsNullOrEmpty(file))
            {
                url += "/?file=" + Uri.EscapeDataString(file);
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

            // Also kill any remaining start.bat processes to be clean
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

        private static void OnViewLogs(object sender, EventArgs e)
        {
            string logPath = Path.Combine(appDir, ".valor_data", "app.log");
            if (File.Exists(logPath))
            {
                try
                {
                    Process.Start("notepad.exe", logPath);
                }
                catch (Exception ex)
                {
                    MessageBox.Show("Failed to open log file: " + ex.Message, "Valor Logs", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            else
            {
                MessageBox.Show("No log file found yet. Start playing media to generate logs.", "Valor Logs", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        private class DarkRenderer : ToolStripProfessionalRenderer
        {
            public DarkRenderer() : base(new DarkColorTable()) { }
            
            protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
            {
                if (e.Item.Selected)
                {
                    // Hover color: Netflix red
                    using (var brush = new SolidBrush(Color.FromArgb(229, 9, 20)))
                    {
                        e.Graphics.FillRectangle(brush, e.Item.ContentRectangle);
                    }
                }
                else
                {
                    using (var brush = new SolidBrush(Color.FromArgb(15, 15, 15)))
                    {
                        e.Graphics.FillRectangle(brush, e.Item.ContentRectangle);
                    }
                }
            }

            protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
            {
                using (var pen = new Pen(Color.FromArgb(44, 44, 44), 1))
                {
                    e.Graphics.DrawRectangle(pen, 0, 0, e.ToolStrip.Width - 1, e.ToolStrip.Height - 1);
                }
            }
        }

        private class DarkColorTable : ProfessionalColorTable
        {
            public override Color ToolStripDropDownBackground { get { return Color.FromArgb(15, 15, 15); } }
            public override Color ImageMarginGradientBegin { get { return Color.FromArgb(15, 15, 15); } }
            public override Color ImageMarginGradientMiddle { get { return Color.FromArgb(15, 15, 15); } }
            public override Color ImageMarginGradientEnd { get { return Color.FromArgb(15, 15, 15); } }
            public override Color MenuBorder { get { return Color.FromArgb(44, 44, 44); } }
            public override Color MenuItemSelected { get { return Color.FromArgb(229, 9, 20); } }
            public override Color MenuItemBorder { get { return Color.FromArgb(229, 9, 20); } }
            public override Color SeparatorDark { get { return Color.FromArgb(33, 33, 33); } }
            public override Color SeparatorLight { get { return Color.FromArgb(15, 15, 15); } }
        }
    }
}
