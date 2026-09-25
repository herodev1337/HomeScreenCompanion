using System.Collections.Generic;
using MediaBrowser.Controller.Net;
using MediaBrowser.Model.Services;

namespace HomeScreenCompanion
{
    [Route("/HomeScreenCompanion/TopList/Status", "GET")]
    [Authenticated]
    public class GetTopListStatusRequest : IReturn<TopListStatusResponse> { }

    public class TopListStatusResponse
    {
        public bool IsRunning { get; set; }
        public string LastRunStatus { get; set; } = "";
        public List<string> Logs { get; set; } = new List<string>();
        public string StartedUtc { get; set; } = "";
    }

    [Route("/HomeScreenCompanion/TopList/PrepareFolder", "POST")]
    [Authenticated(Roles = "Admin")]
    public class PrepareTopListFolderRequest : IReturn<PrepareTopListFolderResponse>
    {
        public string TagName { get; set; } = "";
        public int MaxItems { get; set; } = 0;
        public string BadgeStyle { get; set; } = "neutral";
    }

    public class PrepareTopListFolderResponse
    {
        public bool Success { get; set; }
        public string FolderPath { get; set; } = "";
        public string Message { get; set; } = "";
        public int FilesCreated { get; set; }
    }

    [Route("/HomeScreenCompanion/TopList/List", "GET")]
    [Authenticated]
    public class GetTopListsRequest : IReturn<GetTopListsResponse> { }

    public class GetTopListsResponse
    {
        public List<string> FolderNames { get; set; } = new List<string>();
        public Dictionary<string, int> MovieCounts { get; set; } = new Dictionary<string, int>();
    }

    [Route("/HomeScreenCompanion/TopList/ManualItems", "GET")]
    [Authenticated]
    public class GetManualTopListItemsRequest : IReturn<GetManualTopListItemsResponse>
    {
        public string ListName { get; set; } = "";
    }

    public class GetManualTopListItemsResponse
    {
        public bool Success { get; set; }
        public List<MovieItem> Movies { get; set; } = new List<MovieItem>();
        public string CustomName { get; set; } = "";
        public string DisplayMode { get; set; } = "";
        public string ImageType { get; set; } = "";
        public string BadgeStyle { get; set; } = "neutral";
        public List<string> UserIds { get; set; } = new List<string>();
        public string Message { get; set; } = "";
    }

    [Route("/HomeScreenCompanion/TopList/Delete", "POST")]
    [Authenticated(Roles = "Admin")]
    public class DeleteTopListRequest : IReturn<DeleteTopListResponse>
    {
        public string TagName { get; set; } = "";
    }

    public class DeleteTopListResponse
    {
        public bool Success { get; set; }
        public string FolderPath { get; set; } = "";
        public string Message { get; set; } = "";
    }

    [Route("/HomeScreenCompanion/TopList/SyncHomeSections", "POST")]
    [Authenticated(Roles = "Admin")]
    public class PrepareTopListHomeSectionsRequest : IReturn<PrepareTopListHomeSectionsResponse>
    {
        public string TagName { get; set; } = "";
    }

    public class PrepareTopListHomeSectionsResponse
    {
        public bool Success { get; set; }
        public int UsersCreated { get; set; }
        public int UsersUpdated { get; set; }
        public string Message { get; set; } = "";
    }

    [Route("/HomeScreenCompanion/TopList/SyncAllSections", "POST")]
    [Authenticated(Roles = "Admin")]
    public class SyncAllTopListSectionsRequest : IReturn<SyncAllTopListSectionsResponse> { }

    public class SyncAllTopListSectionsResponse
    {
        public bool Success { get; set; }
        public int UpdatedSections { get; set; }
        public string Message { get; set; } = "";
    }

    [Route("/HomeScreenCompanion/TopList/MergeVersions", "POST")]
    [Authenticated(Roles = "Admin")]
    public class MergeTopListVersionsRequest : IReturn<MergeTopListVersionsResponse>
    {
        public string TagName { get; set; } = "";
    }

    public class MergeTopListVersionsResponse
    {
        public bool Success { get; set; }
        public int Indexed { get; set; }
        public int Merged { get; set; }
        public string Message { get; set; } = "";
    }

    [Route("/HomeScreenCompanion/TopList/AllMovies", "GET")]
    [Authenticated(Roles = "Admin")]
    public class GetAllMoviesRequest : IReturn<GetAllMoviesResponse> { }

    public class MovieItem
    {
        public string Name { get; set; } = "";
        public int? Year { get; set; }
        public string ImdbId { get; set; } = "";
        public string ItemId { get; set; } = "";
    }

    public class GetAllMoviesResponse
    {
        public List<MovieItem> Movies { get; set; } = new List<MovieItem>();
    }

    [Route("/HomeScreenCompanion/TopList/GrantLibraryAccess", "POST")]
    [Authenticated(Roles = "Admin")]
    public class GrantTopListLibraryAccessRequest : IReturn<GrantTopListLibraryAccessResponse>
    {
        public string LibraryId { get; set; } = "";
    }

    public class GrantTopListLibraryAccessResponse
    {
        public bool Success { get; set; }
        public int UsersUpdated { get; set; }
        public string Message { get; set; } = "";
    }

    [Route("/HomeScreenCompanion/TopList/SnapshotPolicies", "POST")]
    [Authenticated(Roles = "Admin")]
    public class SnapshotPoliciesRequest : IReturn<SnapshotPoliciesResponse> { }

    public class SnapshotPoliciesResponse
    {
        public bool Success { get; set; }
        public string SnapshotId { get; set; } = "";
        public int UserCount { get; set; }
        public string Message { get; set; } = "";
    }

    [Route("/HomeScreenCompanion/TopList/RestoreAndGrantAccess", "POST")]
    [Authenticated(Roles = "Admin")]
    public class RestoreAndGrantAccessRequest : IReturn<RestoreAndGrantAccessResponse>
    {
        public string SnapshotId { get; set; } = "";
        public string LibraryId { get; set; } = "";
    }

    public class RestoreAndGrantAccessResponse
    {
        public bool Success { get; set; }
        public int UsersUpdated { get; set; }
        public string Message { get; set; } = "";
    }

    [Route("/HomeScreenCompanion/TopList/PrepareManualFolder", "POST")]
    [Authenticated(Roles = "Admin")]
    public class PrepareManualTopListFolderRequest : IReturn<PrepareTopListFolderResponse>
    {
        public string ListName { get; set; } = "";
        public List<ManualTopListItem> Items { get; set; } = new List<ManualTopListItem>();
        public string BadgeStyle { get; set; } = "neutral";
    }

    public class ManualTopListItem
    {
        public string ImdbId { get; set; } = "";
        public string ItemId { get; set; } = "";
    }

    // Top-list whose Emby library could not be found after an import. The UI can run the
    // normal library-creation flow for each of these using the folder already prepared
    // server-side.
    public class TopListLibraryInfo
    {
        public string TagName { get; set; } = "";
        public string CustomName { get; set; } = "";
        public string DisplayMode { get; set; } = "";
        public string ImageType { get; set; } = "";
        public string BadgeStyle { get; set; } = "neutral";
        public int MaxItems { get; set; }
        public List<string> UserIds { get; set; } = new List<string>();
        public string FolderPath { get; set; } = "";
    }
}
