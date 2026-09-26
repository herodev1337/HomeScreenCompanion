using System.Collections.Generic;
using MediaBrowser.Controller.Net;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Tasks;

namespace HomeScreenCompanion
{
    public class MdbListItem
    {
        public string title { get; set; }
        public string imdb_id { get; set; }
        public int? id { get; set; }
        public string mediatype { get; set; }
    }

    public class MdbListResponse
    {
        public List<MdbListItem> movies { get; set; } = new List<MdbListItem>();
        public List<MdbListItem> shows { get; set; } = new List<MdbListItem>();
    }

    public class TraktBaseObject
    {
        public int rank { get; set; }
        public string type { get; set; }
        public TraktMovie movie { get; set; }
        public TraktShow show { get; set; }
    }

    public class TraktMovie
    {
        public string title { get; set; }
        public int year { get; set; }
        public TraktIds ids { get; set; }
    }

    public class TraktShow
    {
        public string title { get; set; }
        public int year { get; set; }
        public TraktIds ids { get; set; }
    }

    public class TraktIds
    {
        public int trakt { get; set; }
        public string slug { get; set; }
        public int? tmdb { get; set; }
        public string imdb { get; set; }
    }

    public class SyncStatusResponse
    {
        public string LastSyncTime { get; set; } = "";
        public bool IsRunning { get; set; }
        public TaskInfo LastSyncResult { get; set; }
        public int SectionsCopied { get; set; }
        public List<string> Logs { get; set; } = new List<string>();
        public string StartedUtc { get; set; } = "";
    }

    public class StatusResponse
    {
        public MediaBrowser.Model.Tasks.TaskInfo TaskInfo { get; set; } = new MediaBrowser.Model.Tasks.TaskInfo();
        public List<string> Logs { get; set; } = new List<string>();
        public string StartedUtc { get; set; } = "";
        public int SectionsCopied { get; set; }
    }

    [MediaBrowser.Model.Services.Route("/HomeScreenCompanion/StatusV2", "GET")]
    [Authenticated]
    public class StatusV2Request : MediaBrowser.Model.Services.IReturn<StatusResponse> { }

    [MediaBrowser.Model.Services.Route("/HomeScreenCompanion/Run", "POST")]
    [Authenticated(Roles = "Admin")]
    public class RunRequest : MediaBrowser.Model.Services.IReturn<StatusResponse>
    {
        public string TagName { get; set; } = "";
    }

    [MediaBrowser.Model.Services.Route("/HomeScreenCompanion/UserSections", "GET")]
    [Authenticated]
    public class GetUserSectionsRequest : MediaBrowser.Model.Services.IReturn<UserSectionsResponse>
    {
        public string UserId { get; set; } = "";
    }

    public class UserSectionsResponse
    {
        public ContentSection[] Sections { get; set; } = System.Array.Empty<ContentSection>();
    }

    [MediaBrowser.Model.Services.Route("/HomeScreenCompanion/UserSections", "POST")]
    [Authenticated(Roles = "Admin")]
    public class SaveUserSectionsRequest : MediaBrowser.Model.Services.IReturn<SaveUserSectionsResponse>
    {
        public string UserId { get; set; } = "";
        public ContentSection[] Sections { get; set; } = System.Array.Empty<ContentSection>();
    }

    public class SaveUserSectionsResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = "";
    }

    [MediaBrowser.Model.Services.Route("/HomeScreenCompanion/SectionSchema", "GET")]
    [Authenticated]
    public class GetSectionSchemaRequest : MediaBrowser.Model.Services.IReturn<SectionSchemaResponse> { }

    [MediaBrowser.Model.Services.Route("/HomeScreenCompanion/DebugMethods", "GET")]
    [Authenticated(Roles = "Admin")]
    public class DebugMethodsRequest : MediaBrowser.Model.Services.IReturn<string> { }

    public class SectionSchemaResponse
    {
        public List<SectionField> Fields { get; set; } = new List<SectionField>();
    }

    public class SectionField
    {
        public string Name { get; set; } = "";
        public string Type { get; set; } = "";
    }

    // AI source DTOs

    public class OpenAiResponse
    {
        public List<OpenAiChoice> choices { get; set; } = new List<OpenAiChoice>();
    }

    public class OpenAiChoice
    {
        public OpenAiMessage message { get; set; } = new OpenAiMessage();
    }

    public class OpenAiMessage
    {
        public string role { get; set; } = "";
        public string content { get; set; } = "";
    }

    public class GeminiResponse
    {
        public List<GeminiCandidate> candidates { get; set; } = new List<GeminiCandidate>();
    }

    public class GeminiCandidate
    {
        public GeminiContent content { get; set; } = new GeminiContent();
    }

    public class GeminiContent
    {
        public List<GeminiPart> parts { get; set; } = new List<GeminiPart>();
    }

    public class GeminiPart
    {
        public string text { get; set; } = "";
    }

    public class OllamaResponse
    {
        public OllamaMessage message { get; set; } = new OllamaMessage();
    }

    public class OllamaMessage
    {
        public string role { get; set; } = "";
        public string content { get; set; } = "";
    }

    public class ClaudeResponse
    {
        public List<ClaudeContent> content { get; set; } = new List<ClaudeContent>();
    }

    public class ClaudeContent
    {
        public string type { get; set; } = "";
        public string text { get; set; } = "";
    }

    public class AiListItem
    {
        public string title { get; set; } = "";
        public int? year { get; set; }
        public string imdb_id { get; set; }
        public string type { get; set; } = "";
    }

    [MediaBrowser.Model.Services.Route("/HomeScreenCompanion/ApplyTagHomeSections", "POST")]
    [Authenticated(Roles = "Admin")]
    public class ApplyTagHomeSectionsRequest : MediaBrowser.Model.Services.IReturn<ApplyTagHomeSectionsResponse>
    {
        public string TagName { get; set; } = "";
    }

    public class ApplyTagHomeSectionsResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = "";
        public int UsersUpdated { get; set; }
    }

    [MediaBrowser.Model.Services.Route("/HomeScreenCompanion/TestAiSource", "POST")]
    [Authenticated(Roles = "Admin")]
    public class TestAiSourceRequest : MediaBrowser.Model.Services.IReturn<TestAiSourceResponse>
    {
        public string Provider { get; set; } = "OpenAI";
        public string Prompt { get; set; } = "";
        public bool IncludeRecentlyWatched { get; set; } = false;
        public string RecentlyWatchedUserId { get; set; } = "";
        public int RecentlyWatchedCount { get; set; } = 20;
    }

    public class TestAiSourceResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = "";
        public int Count { get; set; }
        public List<string> Preview { get; set; } = new List<string>();
    }

    public class TmdbListResponse
    {
        public List<TmdbListItem> items { get; set; } = new List<TmdbListItem>();
        public List<TmdbListItem> results { get; set; } = new List<TmdbListItem>();
        public int total_pages { get; set; }
    }

    public class TmdbListItem
    {
        public string title { get; set; }
        public string name { get; set; }
        public int id { get; set; }
        public string media_type { get; set; }
    }

    public class TmdbExternalIds
    {
        public string imdb_id { get; set; }
    }
}
