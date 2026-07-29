using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace ValorTray
{
    internal static class Program
    {
        private const string MutexName = "Global\\ValorPlayerMutex";
        private const int DefaultPort = 50000;

        private static NotifyIcon trayIcon;
        private static Mutex mutex;
        private static Process serverProcess;

        private static string appDir;
        private static string nodeExe;
        private static string startScript;
        private static string pidFile;
        private static string portFile;
        private static string logFile;
private static string[] launchArgs;

        [STAThread]
        static void Main(string[] args)
        {
            appDir = AppDomain.CurrentDomain.BaseDirectory;
launchArgs = args;

            nodeExe = Path.Combine(appDir, "node.exe");
            startScript = Path.Combine(appDir, "start-app.js");

            Directory.CreateDirectory(Path.Combine(appDir, ".valor_data"));

            pidFile = Path.Combine(appDir, ".valor_data", "server.pid");
            portFile = Path.Combine(appDir, ".valor_data", "active_port.txt");
            logFile = Path.Combine(appDir, ".valor_data", "launcher.log");

            bool createdNew;

            mutex = new Mutex(true, MutexName, out createdNew);

            if (!createdNew)
            {
                if (TryReuseRunningInstance(args))
                    return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            StartServer(args);
            CreateTray();
            WaitForServer();
            Application.Run();
        }

        private static void CreateTray()
        {
            ContextMenuStrip menu = new ContextMenuStrip();

            menu.BackColor = Color.FromArgb(20,20,20);
            menu.ForeColor = Color.White;
            menu.ShowImageMargin = false;
	menu.Renderer = new DarkRenderer();
menu.Font = new Font("Segoe UI", 9F);

            menu.Items.Add("Open Valor", null, OnOpen);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("View Logs", null, OnLogs);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Restart Server", null, OnRestart);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Exit", null, OnExit);

            Icon icon = SystemIcons.Application;

            string iconPath = Path.Combine(appDir,"public","logo.ico");

            if(File.Exists(iconPath))
            {
                try
                {
                    icon = new Icon(iconPath);
                }
                catch{}
            }

            trayIcon = new NotifyIcon
            {
                Icon = icon,
                Text = "Valor",
                Visible = true,
                ContextMenuStrip = menu
            };

            trayIcon.DoubleClick += OnOpen;
        }

        private static void Log(string message)
        {
            try
            {
                File.AppendAllText(
                    logFile,
                    string.Format("[{0:yyyy-MM-dd HH:mm:ss}] {1}{2}", DateTime.Now, message, Environment.NewLine));
            }
            catch{}
        }


	        private static void StartServer(string[] args)
        {
            if (!File.Exists(nodeExe))
            {
                MessageBox.Show(
                    "node.exe could not be found.",
                    "Valor",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);

                Application.Exit();
                return;
            }

            if (!File.Exists(startScript))
            {
                MessageBox.Show(
                    "start-app.js could not be found.",
                    "Valor",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);

                Application.Exit();
                return;
            }

            List<string> arguments = new List<string>();

            arguments.Add(string.Format("\"{0}\"", startScript));

            foreach (string arg in args)
                arguments.Add(arg);

            if (!arguments.Contains("--tray"))
                arguments.Add("--tray");

            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = nodeExe,
                Arguments = string.Join(" ", arguments),
                WorkingDirectory = appDir,

                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,

                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

            serverProcess = new Process();
            serverProcess.StartInfo = psi;
            serverProcess.EnableRaisingEvents = true;

            serverProcess.OutputDataReceived += (_, e) =>
            {
                if (!string.IsNullOrWhiteSpace(e.Data))
                    Log("[NODE] " + e.Data);
            };

            serverProcess.ErrorDataReceived += (_, e) =>
            {
                if (!string.IsNullOrWhiteSpace(e.Data))
                    Log("[ERROR] " + e.Data);
            };

            serverProcess.Exited += (_, __) =>
            {
                Log("Server exited.");

                try
                {
                    if (File.Exists(pidFile))
                        File.Delete(pidFile);
                }
                catch
                {
                }

                if (trayIcon != null)
                {
                    trayIcon.ShowBalloonTip(
                        3000,
                        "Valor",
                        "Background server stopped.",
                        ToolTipIcon.Warning);
                }
            };

            try
            {
                serverProcess.Start();

                serverProcess.BeginOutputReadLine();
                serverProcess.BeginErrorReadLine();

                File.WriteAllText(
                    pidFile,
                    serverProcess.Id.ToString());

                Log(string.Format("Server started. PID={0}", serverProcess.Id));
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    ex.ToString(),
                    "Unable to start server",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);

                Application.Exit();
            }
        }

        private static void StopServer()
        {
            try
            {
                if (serverProcess != null)
                {
                    if (!serverProcess.HasExited)
                    {
                        Log("Stopping server...");
                        if (!serverProcess.CloseMainWindow())
                        {
                            serverProcess.Kill();
                        }

                        serverProcess.WaitForExit(5000);

                        if (!serverProcess.HasExited)
                        {
                            serverProcess.Kill();
                        }
                    }

                    serverProcess.Dispose();
                    serverProcess = null;
                }
            }
            catch (Exception ex)
            {
                Log(ex.ToString());
            }

            try
            {
                if (File.Exists(pidFile))
                    File.Delete(pidFile);
            }
            catch
            {
            }
        }

        private static void RestartServer()
        {
            Log("Restart requested.");

            StopServer();

            Thread.Sleep(1000);

            StartServer(launchArgs);

            WaitForServer();
        }

        private static bool WaitForServer(int timeout = 30000)
        {
            Stopwatch sw = Stopwatch.StartNew();

            while (sw.ElapsedMilliseconds < timeout)
            {
                try
                {
                    using (TcpClient client = new TcpClient())
                    {
                        IAsyncResult result = client.BeginConnect(
                            "127.0.0.1",
                            GetServerPort(),
                            null,
                            null);

                        bool success = result.AsyncWaitHandle.WaitOne(500);

                        if (success)
                        {
                            client.EndConnect(result);

                            Log("Server is ready.");

                            return true;
                        }
                    }
                }
                catch
                {
                }

                Thread.Sleep(300);
            }

            Log("Timed out waiting for server.");

            if (trayIcon != null)
            {
                trayIcon.ShowBalloonTip(
                    3000,
                    "Valor",
                    "Server failed to start.",
                    ToolTipIcon.Error);
            }

            return false;
        }

        private static int GetServerPort()
        {
            try
            {
                if (File.Exists(portFile))
                {
                    string value = File.ReadAllText(portFile).Trim();

                    int port;
                    if (int.TryParse(value, out port))
                        return port;
                }
            }
            catch
            {
            }

            return DefaultPort;
        }

        private static bool TryReuseRunningInstance(string[] args)
        {
            string file = "";

            foreach (string arg in args)
            {
                if (!arg.StartsWith("-"))
                {
                    file = arg;
                    break;
                }
            }

            try
            {
                using (HttpClient client = new HttpClient())
                {
                    client.Timeout = TimeSpan.FromSeconds(2);

                    string url = string.Format("http://127.0.0.1:{0}/api/play", GetServerPort());

                    if (!string.IsNullOrWhiteSpace(file))
                    {
                        url += "?file=" + Uri.EscapeDataString(file);
                    }

                    HttpResponseMessage response =
                        client.GetAsync(url).Result;

                    if (response.IsSuccessStatusCode)
                    {
                        Log("Forwarded request to running instance.");
                        return true;
                    }
                }
            }
            catch
            {
            }

            return false;
        }

        private static void OpenBrowser(string file = "")
        {
            string url = string.Format("http://127.0.0.1:{0}", GetServerPort());

            if (!string.IsNullOrWhiteSpace(file))
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
            catch (Exception ex)
            {
                Log(ex.ToString());
            }
        }

        private static void OnOpen(object sender, EventArgs e)
        {
            OpenBrowser();
        }

        private static void OnRestart(object sender, EventArgs e)
        {
            trayIcon.ShowBalloonTip(
                1500,
                "Valor",
                "Restarting background server...",
                ToolTipIcon.Info);

            RestartServer();
        }

        private static void OnLogs(object sender, EventArgs e)
        {
            try
            {
                if (!File.Exists(logFile))
                {
                    File.WriteAllText(logFile, "");
                }

                Process.Start(new ProcessStartInfo
                {
                    FileName = "notepad.exe",
                    Arguments = "\"" + logFile + "\"",
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    ex.Message,
                    "Valor",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }

        private static void OnExit(object sender, EventArgs e)
        {
            try
            {
                trayIcon.Visible = false;
            }
            catch
            {
            }

            StopServer();

            try
            {
                mutex.ReleaseMutex();
            }
            catch
            {
            }

            try
            {
                mutex.Dispose();
            }
            catch
            {
            }

            try
            {
                trayIcon.Dispose();
            }
            catch
            {
            }

            Application.Exit();
        }

        private sealed class DarkRenderer : ToolStripProfessionalRenderer
        {
            public DarkRenderer() : base(new DarkColorTable())
            {
            }

            protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e)
            {
                using (SolidBrush brush = new SolidBrush(Color.FromArgb(18, 18, 18)))
                {
                    e.Graphics.FillRectangle(brush, e.AffectedBounds);
                }
            }

            protected override void OnRenderImageMargin(ToolStripRenderEventArgs e)
            {
            }

            protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
            {
                Rectangle rect = new Rectangle(
                    2,
                    2,
                    e.Item.Width - 4,
                    e.Item.Height - 4);

                Color color = e.Item.Selected
                    ? Color.FromArgb(229, 9, 20)
                    : Color.FromArgb(18, 18, 18);

                using (SolidBrush brush = new SolidBrush(color))
                {
                    e.Graphics.FillRectangle(brush, rect);
                }
            }

            protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e)
            {
                using (Pen pen = new Pen(Color.FromArgb(45, 45, 45)))
                {
                    int y = e.Item.Height / 2;

                    e.Graphics.DrawLine(
                        pen,
                        10,
                        y,
                        e.Item.Width - 10,
                        y);
                }
            }

            protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
            {
                using (Pen pen = new Pen(Color.FromArgb(55, 55, 55)))
                {
                    e.Graphics.DrawRectangle(
                        pen,
                        0,
                        0,
                        e.ToolStrip.Width - 1,
                        e.ToolStrip.Height - 1);
                }
            }

            protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
            {
                e.TextColor = Color.White;

                base.OnRenderItemText(e);
            }
        }

        private sealed class DarkColorTable : ProfessionalColorTable
        {
            public override Color ToolStripDropDownBackground
            {
                get { return Color.FromArgb(18, 18, 18); }
            }

            public override Color MenuBorder
            {
                get { return Color.FromArgb(45, 45, 45); }
            }

            public override Color MenuItemBorder
            {
                get { return Color.FromArgb(229, 9, 20); }
            }

            public override Color MenuItemSelected
            {
                get { return Color.FromArgb(229, 9, 20); }
            }

            public override Color ImageMarginGradientBegin
            {
                get { return Color.FromArgb(18, 18, 18); }
            }

            public override Color ImageMarginGradientMiddle
            {
                get { return Color.FromArgb(18, 18, 18); }
            }

            public override Color ImageMarginGradientEnd
            {
                get { return Color.FromArgb(18, 18, 18); }
            }

            public override Color SeparatorDark
            {
                get { return Color.FromArgb(45, 45, 45); }
            }

            public override Color SeparatorLight
            {
                get { return Color.FromArgb(18, 18, 18); }
            }
        }
    }
}