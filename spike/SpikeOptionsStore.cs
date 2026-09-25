using System;
using System.IO;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Serialization;

namespace HomeScreenCompanion.Spike
{
    /// <summary>
    /// Tiny file store just to prove <c>SaveConfiguration()</c> round-trips
    /// through the standard Emby plugin config path. <c>Plugin.UpdateConfiguration</c>
    /// is what <see cref="MediaBrowser.Common.Plugins.BasePlugin{TConfigurationType}"/>
    /// already wires against <c>ConfigurationType</c>.
    /// </summary>
    public class SpikeOptionsStore
    {
        private readonly ILogger logger;
        private readonly IJsonSerializer json;
        private readonly string path;

        public SpikeOptionsStore(ILogManager logManager, IJsonSerializer json)
        {
            this.logger = logManager.GetLogger("HomeScreenCompanion.Spike");
            this.json = json;
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            this.path = Path.Combine(appData, "emby", "pluginconfig", "HomeScreenCompanion.Spike.json");
        }

        public SpikeOptions Load()
        {
            try
            {
                if (!File.Exists(this.path))
                {
                    return new SpikeOptions();
                }

                var jsonText = File.ReadAllText(this.path);
                return this.json.DeserializeFromString<SpikeOptions>(jsonText) ?? new SpikeOptions();
            }
            catch (Exception ex)
            {
                this.logger.Warn("Spike load failed: {0}", ex.Message);
                return new SpikeOptions();
            }
        }

        public void Save(SpikeOptions options)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(this.path));
                File.WriteAllText(this.path, this.json.SerializeToString(options));
            }
            catch (Exception ex)
            {
                this.logger.Warn("Spike save failed: {0}", ex.Message);
            }
        }
    }

    public class SpikeOptions
    {
        public string? OutputFolder { get; set; }
        public string? MessageFormat { get; set; }
        public MediaBrowser.Model.Logging.LogSeverity LogLevel { get; set; }
    }
}