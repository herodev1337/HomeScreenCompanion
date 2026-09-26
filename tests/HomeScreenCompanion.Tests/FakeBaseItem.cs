using System;
using MediaBrowser.Controller.Entities;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Test-only <see cref="BaseItem"/> subclass used by the unit-test process
/// where the real Emby item constructors (which wire ILibraryManager /
/// IProviderManager / etc.) are unavailable. <see cref="BaseItem"/> is
/// abstract, so a concrete subclass must exist to seed the
/// static-only helpers that take a <c>BaseItem</c> argument.
///
/// We only construct it in tests that exercise <c>static</c>
/// helpers — none of the per-instance behaviour paths on
/// <see cref="BaseItem"/> are exercised here, so we leave the
/// setters on the public surface we touch (DateModified, Size)
/// settable via reflection-free public properties where they
/// exist, and let everything else fall through.
/// </summary>
public class FakeBaseItem : BaseItem
{
}
