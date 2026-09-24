using System.Collections.Generic;
using MediaBrowser.Model.Services;

namespace HomeScreenCompanion
{
    /// <summary>
    /// Request to test connectivity to an arbitrary URL.
    /// </summary>
    [Route("/HomeScreenCompanion/TestUrl", "GET")]
    public class TestUrlRequest : IReturn<TestUrlResponse>
    {
        public string Url { get; set; } = string.Empty;
        public int Limit { get; set; } = 10;
    }

    /// <summary>
    /// Response for <see cref="TestUrlRequest"/>.
    /// </summary>
    public class TestUrlResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public int Count { get; set; }
    }

    /// <summary>
    /// Request to fetch the current sync status snapshot.
    /// </summary>
    [Route("/HomeScreenCompanion/Status", "GET")]
    public class GetStatusRequest : IReturn<StatusResponse> { }

    /// <summary>
    /// Request to fetch the plugin's installed version.
    /// </summary>
    [Route("/HomeScreenCompanion/Version", "GET")]
    public class VersionRequest : IReturn<VersionResponse> { }

    /// <summary>
    /// Response for <see cref="VersionRequest"/>.
    /// </summary>
    public class VersionResponse
    {
        public string Version { get; set; } = "";
    }

    /// <summary>
    /// Response for <see cref="GetStatusRequest"/>.
    /// </summary>
    public class StatusResponse
    {
        public string LastRunStatus { get; set; } = string.Empty;
        public List<string> Logs { get; set; } = new List<string>();
        public bool IsRunning { get; set; }
        public string StartedUtc { get; set; } = string.Empty;
    }

    /// <summary>
    /// Request to run a single configured entry (tag/group) immediately.
    /// </summary>
    [Route("/HomeScreenCompanion/RunEntry", "POST")]
    public class RunEntryRequest : IReturn<RunEntryResponse>
    {
        public string EntryName { get; set; } = "";
    }

    /// <summary>
    /// Response for <see cref="RunEntryRequest"/>.
    /// </summary>
    public class RunEntryResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = "";
    }

    /// <summary>
    /// Request to fetch the home-section sync status snapshot.
    /// Response is shared with the HSC endpoint family and lives in <c>DTOs.cs</c>.
    /// </summary>
    [Route("/HomeScreenCompanion/Hsc/Status", "GET")]
    public class HscGetStatusRequest : IReturn<HscSyncStatusResponse> { }

    /// <summary>
    /// Request for a debug dump of the user's home sections.
    /// </summary>
    [Route("/HomeScreenCompanion/DebugSections", "GET")]
    public class DebugSectionsRequest : IReturn<string>
    {
        public string UserId { get; set; } = string.Empty;
    }
}