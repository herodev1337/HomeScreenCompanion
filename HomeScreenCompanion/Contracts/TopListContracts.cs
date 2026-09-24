using System.Collections.Generic;
using MediaBrowser.Model.Services;

namespace HomeScreenCompanion
{
    /// <summary>
    /// Request to fetch the TopList sync task status snapshot.
    /// </summary>
    [Route("/HomeScreenCompanion/TopList/Status", "GET")]
    public class GetTopListStatusRequest : IReturn<TopListStatusResponse> { }

    /// <summary>
    /// Response for <see cref="GetTopListStatusRequest"/>.
    /// </summary>
    public class TopListStatusResponse
    {
        public bool IsRunning { get; set; }
        public string LastRunStatus { get; set; } = "";
        public List<string> Logs { get; set; } = new List<string>();
        public string StartedUtc { get; set; } = "";
    }

    /// <summary>
    /// Request to prepare (create / refresh) a top-list folder for the given tag.
    /// </summary>
    [Route("/HomeScreenCompanion/TopList/PrepareFolder", "POST")]
    public class PrepareTopListFolderRequest : IReturn<PrepareTopListFolderResponse>
    {
        public string TagName { get; set; } = "";
        public int MaxItems { get; set; } = 0;
        public string BadgeStyle { get; set; } = "neutral";
    }

    /// <summary>
    /// Response for <see cref="PrepareTopListFolderRequest"/>.
    /// </summary>
    public class PrepareTopListFolderResponse
    {
        public bool Success { get; set; }
        public string FolderPath { get; set; } = "";
        public string Message { get; set; } = "";
        public int FilesCreated { get; set; }
    }

    /// <summary>
    /// Request to enumerate existing top-list folders and their movie counts.
    /// </summary>
    [Route("/HomeScreenCompanion/TopList/List", "GET")]
    public class GetTopListsRequest : IReturn<GetTopListsResponse> { }

    /// <summary>
    /// Response for <see cref="GetTopListsRequest"/>.
    /// </summary>
    public class GetTopListsResponse
    {
        public List<string> FolderNames { get; set; } = new List<string>();
        public Dictionary<string, int> MovieCounts { get; set; } = new Dictionary<string, int>();
    }

    /// <summary>
    /// Request to fetch the manual movie list backing a manual top-list folder.
    /// </summary>
    [Route("/HomeScreenCompanion/TopList/ManualItems", "GET")]
    public class GetManualTopListItemsRequest : IReturn<GetManualTopListItemsResponse>
    {
        public string ListName { get; set; } = "";
    }

    /// <summary>
    /// Response for <see cref="GetManualTopListItemsRequest"/>.
    /// </summary>
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

    /// <summary>
    /// Request to delete a top-list folder (and its underlying library, where applicable).
    /// </summary>
    [Route("/HomeScreenCompanion/TopList/Delete", "POST")]
    public class DeleteTopListRequest : IReturn<DeleteTopListResponse>
    {
        public string TagName { get; set; } = "";
    }

    /// <summary>
    /// Response for <see cref="DeleteTopListRequest"/>.
    /// </summary>
    public class DeleteTopListResponse
    {
        public bool Success { get; set; }
        public string FolderPath { get; set; } = "";
        public string Message { get; set; } = "";
    }

    /// <summary>
    /// Request to create / sync the home sections for a top-list folder.
    /// </summary>
    [Route("/HomeScreenCompanion/TopList/SyncHomeSections", "POST")]
    public class PrepareTopListHomeSectionsRequest : IReturn<PrepareTopListHomeSectionsResponse>
    {
        public string TagName { get; set; } = "";
    }

    /// <summary>
    /// Response for <see cref="PrepareTopListHomeSectionsRequest"/>.
    /// </summary>
    public class PrepareTopListHomeSectionsResponse
    {
        public bool Success { get; set; }
        public int UsersCreated { get; set; }
        public int UsersUpdated { get; set; }
        public string Message { get; set; } = "";
    }

    /// <summary>
    /// Request to run a full sync across every top-list folder.
    /// </summary>
    [Route("/HomeScreenCompanion/TopList/SyncAllSections", "POST")]
    public class SyncAllTopListSectionsRequest : IReturn<SyncAllTopListSectionsResponse> { }

    /// <summary>
    /// Response for <see cref="SyncAllTopListSectionsRequest"/>.
    /// </summary>
    public class SyncAllTopListSectionsResponse
    {
        public bool Success { get; set; }
        public int UpdatedSections { get; set; }
        public string Message { get; set; } = "";
    }

    /// <summary>
    /// Request to merge on-disk top-list versions for a given tag.
    /// </summary>
    [Route("/HomeScreenCompanion/TopList/MergeVersions", "POST")]
    public class MergeTopListVersionsRequest : IReturn<MergeTopListVersionsResponse>
    {
        public string TagName { get; set; } = "";
    }

    /// <summary>
    /// Response for <see cref="MergeTopListVersionsRequest"/>.
    /// </summary>
    public class MergeTopListVersionsResponse
    {
        public bool Success { get; set; }
        public int Indexed { get; set; }
        public int Merged { get; set; }
        public string Message { get; set; } = "";
    }

    /// <summary>
    /// Request to list every movie currently present in any top-list folder.
    /// </summary>
    [Route("/HomeScreenCompanion/TopList/AllMovies", "GET")]
    public class GetAllMoviesRequest : IReturn<GetAllMoviesResponse> { }

    /// <summary>
    /// Lightweight movie descriptor used by top-list responses.
    /// </summary>
    public class MovieItem
    {
        public string Name { get; set; } = "";
        public int? Year { get; set; }
        public string ImdbId { get; set; } = "";
        public string ItemId { get; set; } = "";
    }

    /// <summary>
    /// Response for <see cref="GetAllMoviesRequest"/>.
    /// </summary>
    public class GetAllMoviesResponse
    {
        public List<MovieItem> Movies { get; set; } = new List<MovieItem>();
    }

    /// <summary>
    /// Request to grant every user in the system access to a top-list library.
    /// </summary>
    [Route("/HomeScreenCompanion/TopList/GrantLibraryAccess", "POST")]
    public class GrantTopListLibraryAccessRequest : IReturn<GrantTopListLibraryAccessResponse>
    {
        public string LibraryId { get; set; } = "";
    }

    /// <summary>
    /// Response for <see cref="GrantTopListLibraryAccessRequest"/>.
    /// </summary>
    public class GrantTopListLibraryAccessResponse
    {
        public bool Success { get; set; }
        public int UsersUpdated { get; set; }
        public string Message { get; set; } = "";
    }

    /// <summary>
    /// Request to snapshot the current top-list access policies.
    /// </summary>
    [Route("/HomeScreenCompanion/TopList/SnapshotPolicies", "POST")]
    public class SnapshotPoliciesRequest : IReturn<SnapshotPoliciesResponse> { }

    /// <summary>
    /// Response for <see cref="SnapshotPoliciesRequest"/>.
    /// </summary>
    public class SnapshotPoliciesResponse
    {
        public bool Success { get; set; }
        public string SnapshotId { get; set; } = "";
        public int UserCount { get; set; }
        public string Message { get; set; } = "";
    }

    /// <summary>
    /// Request to restore top-list access from a previously taken snapshot.
    /// </summary>
    [Route("/HomeScreenCompanion/TopList/RestoreAndGrantAccess", "POST")]
    public class RestoreAndGrantAccessRequest : IReturn<RestoreAndGrantAccessResponse>
    {
        public string SnapshotId { get; set; } = "";
        public string LibraryId { get; set; } = "";
    }

    /// <summary>
    /// Response for <see cref="RestoreAndGrantAccessRequest"/>.
    /// </summary>
    public class RestoreAndGrantAccessResponse
    {
        public bool Success { get; set; }
        public int UsersUpdated { get; set; }
        public string Message { get; set; } = "";
    }

    /// <summary>
    /// Request to create a top-list folder from a manually-supplied list of movies.
    /// </summary>
    [Route("/HomeScreenCompanion/TopList/PrepareManualFolder", "POST")]
    public class PrepareManualTopListFolderRequest : IReturn<PrepareTopListFolderResponse>
    {
        public string ListName { get; set; } = "";
        public List<ManualTopListItem> Items { get; set; } = new List<ManualTopListItem>();
        public string BadgeStyle { get; set; } = "neutral";
    }

    /// <summary>
    /// Single movie entry supplied to a manual top-list folder.
    /// </summary>
    public class ManualTopListItem
    {
        public string ImdbId { get; set; } = "";
        public string ItemId { get; set; } = "";
    }

    /// <summary>
    /// Top-list whose Emby library could not be found after an import. The UI can run the
    /// normal library-creation flow for each of these using the folder already prepared
    /// server-side.
    /// </summary>
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