using System.Collections.Generic;
using MediaBrowser.Controller.Net;
using MediaBrowser.Model.Services;

namespace HomeScreenCompanion
{
    /// <summary>
    /// Request to list all tags currently managed by the plugin.
    /// </summary>
    [Route("/HomeScreenCompanion/Manage/Tags", "GET")]
    [Authenticated]
    public class GetManagedTagsRequest : IReturn<GetManagedTagsResponse> { }

    /// <summary>
    /// Per-tag summary returned by <see cref="GetManagedTagsRequest"/>.
    /// </summary>
    public class ManagedTagInfo
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public int ItemCount { get; set; }
        public int MovieCount { get; set; }
        public List<string> ItemTypes { get; set; } = new List<string>();
    }

    /// <summary>
    /// Response for <see cref="GetManagedTagsRequest"/>.
    /// </summary>
    public class GetManagedTagsResponse
    {
        public List<ManagedTagInfo> Tags { get; set; } = new List<ManagedTagInfo>();
    }

    /// <summary>
    /// Request to list all collections currently managed by the plugin.
    /// </summary>
    [Route("/HomeScreenCompanion/Manage/Collections", "GET")]
    [Authenticated]
    public class GetManagedCollectionsRequest : IReturn<GetManagedCollectionsResponse> { }

    /// <summary>
    /// Per-collection summary returned by <see cref="GetManagedCollectionsRequest"/>.
    /// </summary>
    public class ManagedCollectionInfo
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public int ItemCount { get; set; }
    }

    /// <summary>
    /// Response for <see cref="GetManagedCollectionsRequest"/>.
    /// </summary>
    public class GetManagedCollectionsResponse
    {
        public List<ManagedCollectionInfo> Collections { get; set; } = new List<ManagedCollectionInfo>();
    }

    /// <summary>
    /// Request to remove a single tag from all library items it was applied to.
    /// </summary>
    [Route("/HomeScreenCompanion/Manage/DeleteTag", "POST")]
    [Authenticated(Roles = "Admin")]
    public class DeleteManagedTagRequest : IReturn<DeleteManagedTagResponse>
    {
        public string TagName { get; set; } = "";
    }

    /// <summary>
    /// Response for <see cref="DeleteManagedTagRequest"/>.
    /// </summary>
    public class DeleteManagedTagResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = "";
        public int ItemsUpdated { get; set; }
    }

    /// <summary>
    /// Batch variant of <see cref="DeleteManagedTagRequest"/> — removes many tags in one call.
    /// </summary>
    [Route("/HomeScreenCompanion/Manage/DeleteTags", "POST")]
    [Authenticated(Roles = "Admin")]
    public class DeleteManagedTagsBatchRequest : IReturn<DeleteManagedTagsResponse>
    {
        public List<string> TagNames { get; set; } = new List<string>();
    }

    /// <summary>
    /// Response for <see cref="DeleteManagedTagsBatchRequest"/>.
    /// </summary>
    public class DeleteManagedTagsResponse
    {
        public bool Success { get; set; }
        public int ItemsUpdated { get; set; }
    }

    /// <summary>
    /// Request to delete a managed collection by id.
    /// </summary>
    [Route("/HomeScreenCompanion/Manage/DeleteCollection", "POST")]
    [Authenticated(Roles = "Admin")]
    public class DeleteManagedCollectionRequest : IReturn<DeleteManagedCollectionResponse>
    {
        public string CollectionId { get; set; } = "";
    }

    /// <summary>
    /// Response for <see cref="DeleteManagedCollectionRequest"/>.
    /// </summary>
    public class DeleteManagedCollectionResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = "";
    }
}
