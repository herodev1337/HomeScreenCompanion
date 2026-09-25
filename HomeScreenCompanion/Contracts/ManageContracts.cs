using System.Collections.Generic;
using MediaBrowser.Controller.Net;
using MediaBrowser.Model.Services;

namespace HomeScreenCompanion
{
    [Route("/HomeScreenCompanion/Manage/Tags", "GET")]
    [Authenticated]
    public class GetManagedTagsRequest : IReturn<GetManagedTagsResponse> { }

    public class ManagedTagInfo
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public int ItemCount { get; set; }
        public int MovieCount { get; set; }
        public List<string> ItemTypes { get; set; } = new List<string>();
    }

    public class GetManagedTagsResponse
    {
        public List<ManagedTagInfo> Tags { get; set; } = new List<ManagedTagInfo>();
    }

    [Route("/HomeScreenCompanion/Manage/Collections", "GET")]
    [Authenticated]
    public class GetManagedCollectionsRequest : IReturn<GetManagedCollectionsResponse> { }

    public class ManagedCollectionInfo
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public int ItemCount { get; set; }
    }

    public class GetManagedCollectionsResponse
    {
        public List<ManagedCollectionInfo> Collections { get; set; } = new List<ManagedCollectionInfo>();
    }

    [Route("/HomeScreenCompanion/Manage/DeleteTag", "POST")]
    [Authenticated(Roles = "Admin")]
    public class DeleteManagedTagRequest : IReturn<DeleteManagedTagResponse>
    {
        public string TagName { get; set; } = "";
    }

    public class DeleteManagedTagResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = "";
        public int ItemsUpdated { get; set; }
    }

    [Route("/HomeScreenCompanion/Manage/DeleteTags", "POST")]
    [Authenticated(Roles = "Admin")]
    public class DeleteManagedTagsBatchRequest : IReturn<DeleteManagedTagsResponse>
    {
        public List<string> TagNames { get; set; } = new List<string>();
    }

    public class DeleteManagedTagsResponse
    {
        public bool Success { get; set; }
        public int ItemsUpdated { get; set; }
    }

    [Route("/HomeScreenCompanion/Manage/DeleteCollection", "POST")]
    [Authenticated(Roles = "Admin")]
    public class DeleteManagedCollectionRequest : IReturn<DeleteManagedCollectionResponse>
    {
        public string CollectionId { get; set; } = "";
    }

    public class DeleteManagedCollectionResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = "";
    }
}
