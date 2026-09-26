using MediaBrowser.Common.Net;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Net;
using MediaBrowser.Controller.Providers;
using MediaBrowser.Model.IO;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Serialization;
using MediaBrowser.Model.Services;
using MediaBrowser.Model.Tasks;
using System;
using System.Collections.Generic;

namespace HomeScreenCompanion
{
    public partial class HomeScreenCompanionService : IService, IRequiresRequest
    {
        private readonly IHttpClient _httpClient;
        private readonly IJsonSerializer _jsonSerializer;
        private readonly IUserManager _userManager;
        private readonly ILibraryManager _libraryManager;
        private readonly IUserDataManager _userDataManager;
        private readonly IUserViewManager _userViewManager;
        private readonly ITaskManager _taskManager;
        private readonly IProviderManager _providerManager;
        private readonly IFileSystem _fileSystem;
        private readonly ILogger _logger;
        private readonly IAuthorizationContext _authorizationContext;

        public IRequest Request { get; set; }

        public HomeScreenCompanionService(IHttpClient httpClient, IJsonSerializer jsonSerializer, IUserManager userManager, ILibraryManager libraryManager, IUserDataManager userDataManager, IUserViewManager userViewManager, ITaskManager taskManager, IProviderManager providerManager, IFileSystem fileSystem, ILogManager logManager, IAuthorizationContext authorizationContext)
        {
            _httpClient = httpClient;
            _jsonSerializer = jsonSerializer;
            _userManager = userManager;
            _libraryManager = libraryManager;
            _userDataManager = userDataManager;
            _userViewManager = userViewManager;
            _taskManager = taskManager;
            _providerManager = providerManager;
            _fileSystem = fileSystem;
            _logger = logManager.GetLogger("HomeScreenCompanion_Access");
            _authorizationContext = authorizationContext;
        }

        internal static string ResolveUserId(string callerId, bool callerIsAdmin, string requestedUserId)
        {
            if (string.IsNullOrEmpty(callerId)) return "";
            if (string.IsNullOrEmpty(requestedUserId)) return callerId;
            if (string.Equals(requestedUserId, callerId, StringComparison.OrdinalIgnoreCase)) return callerId;
            if (callerIsAdmin) return requestedUserId;
            return callerId;
        }
    }
}
