using System.Collections.Generic;
using MediaBrowser.Controller.Net;
using MediaBrowser.Model.Services;

namespace HomeScreenCompanion
{
    [Route("/HomeScreenCompanion/TestUrl", "GET")]
    [Authenticated(Roles = "Admin")]
    public class TestUrlRequest : IReturn<TestUrlResponse>
    {
        public string Url { get; set; } = string.Empty;
        public int Limit { get; set; } = 10;
    }

    public class TestUrlResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public int Count { get; set; }
    }

    [Route("/HomeScreenCompanion/Status", "GET")]
    [Authenticated]
    public class GetStatusRequest : IReturn<StatusResponse> { }

    [Route("/HomeScreenCompanion/Version", "GET")]
    [Authenticated]
    public class VersionRequest : IReturn<VersionResponse> { }

    public class VersionResponse
    {
        public string Version { get; set; } = "";
    }

    public class StatusResponse
    {
        public string LastRunStatus { get; set; } = string.Empty;
        public List<string> Logs { get; set; } = new List<string>();
        public bool IsRunning { get; set; }
        public string StartedUtc { get; set; } = string.Empty;
    }

    [Route("/HomeScreenCompanion/RunEntry", "POST")]
    [Authenticated(Roles = "Admin")]
    public class RunEntryRequest : IReturn<RunEntryResponse>
    {
        public string EntryName { get; set; } = "";
    }

    public class RunEntryResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = "";
    }

    [Route("/HomeScreenCompanion/Hsc/Status", "GET")]
    [Authenticated]
    public class HscGetStatusRequest : IReturn<HscSyncStatusResponse> { }

    [Route("/HomeScreenCompanion/DebugSections", "GET")]
    [Authenticated(Roles = "Admin")]
    public class DebugSectionsRequest : IReturn<string>
    {
        public string UserId { get; set; } = string.Empty;
    }
}
