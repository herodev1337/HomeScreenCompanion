using MediaBrowser.Controller.Net;
using MediaBrowser.Model.Services;

namespace HomeScreenCompanion
{
    /// <summary>
    /// Request to upload a collection image from raw bytes (base64).
    /// </summary>
    [Route("/HomeScreenCompanion/UploadCollectionImage", "POST")]
    [Authenticated(Roles = "Admin")]
    public class UploadCollectionImageRequest : IReturn<UploadCollectionImageResponse>
    {
        public string FileName { get; set; } = "";
        public string Base64Data { get; set; } = "";
        public string OldFilePath { get; set; } = "";
    }

    /// <summary>
    /// Request to fetch a collection image from an external URL and store it locally.
    /// </summary>
    [Route("/HomeScreenCompanion/FetchCollectionImageFromUrl", "POST")]
    [Authenticated(Roles = "Admin")]
    public class FetchCollectionImageFromUrlRequest : IReturn<UploadCollectionImageResponse>
    {
        public string Url { get; set; } = "";
        public string OldFilePath { get; set; } = "";
    }

    /// <summary>
    /// Response for <see cref="UploadCollectionImageRequest"/> and
    /// <see cref="FetchCollectionImageFromUrlRequest"/>.
    /// </summary>
    public class UploadCollectionImageResponse
    {
        public bool Success { get; set; }
        public string FilePath { get; set; } = "";
        public string Message { get; set; } = "";
    }
}
