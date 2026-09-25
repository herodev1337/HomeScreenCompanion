// Partial of HomeScreenCompanionTask — single-run guard shared by the scheduled Execute
// and HTTP RunSingleEntryAsync entry points.
using System.Threading;
using System.Threading.Tasks;

namespace HomeScreenCompanion
{
    public partial class HomeScreenCompanionTask
    {
        // Single-run guard for Execute (scheduled) and RunSingleEntryAsync (HTTP).
        // SemaphoreSlim(1,1) acquired at the top of each entry point so a second caller
        // is rejected immediately instead of interleaving with the active run.
        //
        // Kept separate from RunContext so its lifetime is independent of a particular
        // run's data and so the gate can be tested without an Emby task instance.
        //
        // Exit() is idempotent on the held-state axis: a second Exit() without a
        // matching TryEnterAsync() does not throw SemaphoreFullException, so the call
        // is safe even if the entry point returned early (e.g. validation failure).
        internal sealed class RunGate
        {
            private readonly SemaphoreSlim _semaphore = new SemaphoreSlim(1, 1);

            public bool IsHeld => _semaphore.CurrentCount == 0;

            public Task<bool> TryEnterAsync(CancellationToken ct)
            {
                if (ct.IsCancellationRequested)
                    return Task.FromCanceled<bool>(ct);
                return Task.FromResult(_semaphore.Wait(0));
            }

            public void Exit()
            {
                if (_semaphore.CurrentCount == 0)
                    _semaphore.Release();
            }
        }
    }
}
