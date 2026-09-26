using MediaBrowser.Controller.Net;
using MediaBrowser.Model.Services;

namespace HomeScreenCompanion
{
    [Route("/HomeScreenCompanion/UploadCollectionImage", "POST")]
    [Authenticated(Roles = "Admin")]
    public class UploadCollectionImageRequest : IReturn<UploadCollectionImageResponse>
    {
        public string FileName { get; set; } = "";
        public string Base64Data { get; set; } = "";
        public string OldFilePath { get; set; } = "";
    }

    [Route("/HomeScreenCompanion/FetchCollectionImageFromUrl", "POST")]
    [Authenticated(Roles = "Admin")]
    public class FetchCollectionImageFromUrlRequest : IReturn<UploadCollectionImageResponse>
    {
        public string Url { get; set; } = "";
        public string OldFilePath { get; set; } = "";
    }

    public class UploadCollectionImageResponse
    {
        public bool Success { get; set; }
        public string FilePath { get; set; } = "";
        public string Message { get; set; } = "";
    }
}
