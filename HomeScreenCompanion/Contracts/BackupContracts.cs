using System.Collections.Generic;
using MediaBrowser.Controller.Net;
using MediaBrowser.Model.Services;

namespace HomeScreenCompanion
{
    [Route("/HomeScreenCompanion/Backup/Export", "POST")]
    [Authenticated(Roles = "Admin")]
    public class ExportBackupRequest : IReturn<BackupFile>
    {
        public bool Settings { get; set; } = true;
        public bool ApiKeys { get; set; } = true;
        public bool Tags { get; set; } = true;
        public bool SavedFilters { get; set; } = true;
        public bool TopLists { get; set; } = true;
        public bool HomeSync { get; set; } = true;
    }

    public class BackupFile
    {
        public int BackupVersion { get; set; }
        public string PluginVersion { get; set; } = "";
        public string CreatedUtc { get; set; } = "";
        public List<string> Sections { get; set; } = new List<string>();
        public BackupSettings? Settings { get; set; }
        public BackupApiKeys? ApiKeys { get; set; }
        public List<TagConfig>? Tags { get; set; }
        public List<SavedMediaInfoFilter>? SavedFilters { get; set; }
        public List<BackupTopList>? TopLists { get; set; }
        public BackupHomeSync? HomeSync { get; set; }
    }

    public class BackupSettings
    {
        public string OpenAiModel { get; set; } = "";
        public string GeminiModel { get; set; } = "";
        public string ClaudeModel { get; set; } = "";
        public string OllamaBaseUrl { get; set; } = "";
        public string OllamaModel { get; set; } = "";
        public string AiSystemPrompt { get; set; } = "";
        public bool ExtendedConsoleOutput { get; set; }
        public bool LogMissingItems { get; set; }
        public bool DryRunMode { get; set; }
        public bool PreserveTagsOnEmptyResult { get; set; } = true;
    }

    public class BackupApiKeys
    {
        public string TraktClientId { get; set; } = "";
        public string MdblistApiKey { get; set; } = "";
        public string TmdbApiKey { get; set; } = "";
        public string OpenAiApiKey { get; set; } = "";
        public string GeminiApiKey { get; set; } = "";
        public string ClaudeApiKey { get; set; } = "";
    }

    public class BackupHomeSync
    {
        public bool HomeSyncEnabled { get; set; }
        public string HomeSyncSourceUserId { get; set; } = "";
        public List<string> HomeSyncTargetUserIds { get; set; } = new List<string>();
        public bool HomeSyncLibraryOrder { get; set; }
    }

    public class BackupTopList
    {
        public TopListHomeSection Config { get; set; } = new TopListHomeSection();
        public bool IsManual { get; set; }
        // Manual lists only: movies in rank order. Tag-based lists are rebuilt from the tag on the next sync.
        public List<BackupTopListItem> Items { get; set; } = new List<BackupTopListItem>();
    }

    public class BackupTopListItem
    {
        public string ImdbId { get; set; } = "";
        public string ItemId { get; set; } = "";
        public string Name { get; set; } = "";
        public int? Year { get; set; }
    }

    [Route("/HomeScreenCompanion/Backup/Import", "POST")]
    [Authenticated(Roles = "Admin")]
    public class ImportBackupRequest : IReturn<ImportBackupResponse>
    {
        public string BackupJson { get; set; } = "";
        public bool Settings { get; set; } = true;
        public bool ApiKeys { get; set; } = true;
        public bool Tags { get; set; } = true;
        public bool SavedFilters { get; set; } = true;
        public bool TopLists { get; set; } = true;
        public bool HomeSync { get; set; } = true;
    }

    public class ImportBackupResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = "";
        public List<string> Applied { get; set; } = new List<string>();
        public List<string> Warnings { get; set; } = new List<string>();
        public List<TopListLibraryInfo> TopListsNeedingLibrary { get; set; } = new List<TopListLibraryInfo>();
    }
}
