using MediaBrowser.Model.Tasks;

namespace HomeScreenCompanion
{
    /// <summary>
    /// Maps the HSC task's free-form status text ("Success", "Failed:
    /// …", empty) onto the SDK's <see cref="TaskCompletionStatus"/>.
    /// </summary>
    internal static class ResultMapper
    {
        public static TaskCompletionStatus ToCompletionStatus(string statusText)
        {
            if (string.IsNullOrEmpty(statusText)) return TaskCompletionStatus.Completed;
            if (statusText.StartsWith("Failed", System.StringComparison.OrdinalIgnoreCase)
                || statusText.StartsWith("Error", System.StringComparison.OrdinalIgnoreCase))
            {
                return TaskCompletionStatus.Failed;
            }
            if (statusText.StartsWith("Cancel", System.StringComparison.OrdinalIgnoreCase))
            {
                return TaskCompletionStatus.Cancelled;
            }
            return TaskCompletionStatus.Completed;
        }
    }
}
