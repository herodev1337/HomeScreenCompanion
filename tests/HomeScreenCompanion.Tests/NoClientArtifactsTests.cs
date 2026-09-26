using System.IO;
using System.Linq;
using System.Xml.Linq;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Audit-plan v2 / Wave 1 / U8: prevents the legacy client app from
/// creeping back into the repo. After Wave 1, the plugin's UI is fully
/// server-side via the Emby SDK declarative-UI model; there is no
/// web client, no AMD bundle, no rollup pipeline.
/// </summary>
public sealed class NoClientArtifactsTests
{
    private static string RepoRoot
    {
        get
        {
            var baseDir = System.AppContext.BaseDirectory;
            return Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "..", ".."));
        }
    }

    [Fact]
    public void Configuration_Directory_Is_Gone()
    {
        var path = Path.Combine(RepoRoot, "HomeScreenCompanion", "Configuration");
        Assert.False(Directory.Exists(path),
            "HomeScreenCompanion/Configuration/ no longer exists — U8 deleted " +
            "configPage.html / configPage.js (now superseded by the SDK UI).");
    }

    [Fact]
    public void ClientApp_Directory_Is_Gone()
    {
        var path = Path.Combine(RepoRoot, "HomeScreenCompanion", "ClientApp");
        Assert.False(Directory.Exists(path),
            "HomeScreenCompanion/ClientApp/ no longer exists — U8 demolished " +
            "the AMD/Rollup bundle. Plugin UI is server-side via the SDK.");
    }

    [Fact]
    public void RepoRoot_Has_No_package_json()
    {
        var path = Path.Combine(RepoRoot, "package.json");
        Assert.False(File.Exists(path), "Repo-root package.json is gone.");
    }

    [Fact]
    public void RepoRoot_Has_No_rollup_config()
    {
        var path = Path.Combine(RepoRoot, "rollup.config.mjs");
        Assert.False(File.Exists(path), "Repo-root rollup.config.mjs is gone.");
    }

    [Fact]
    public void Csproj_Has_No_EmbeddedResource_For_configPage()
    {
        var csproj = Path.Combine(RepoRoot, "HomeScreenCompanion", "HomeScreenCompanion.csproj");
        Assert.True(File.Exists(csproj));
        var doc = XDocument.Load(csproj);
        var embedded = doc.Descendants("EmbeddedResource")
            .Select(e => (string)e.Attribute("Include"))
            .Where(s => s != null)
            .Select(s => s!)
            .ToList();
        Assert.DoesNotContain(embedded, e => e.EndsWith("configPage.html"));
        Assert.DoesNotContain(embedded, e => e.EndsWith("configPage.js"));
    }

    [Fact]
    public void Build_Workflow_Has_No_Npm_Or_ClientApp_Steps()
    {
        var path = Path.Combine(RepoRoot, ".github", "workflows", "build.yml");
        Assert.True(File.Exists(path));
        var lines = File.ReadAllLines(path);
        foreach (var line in lines)
        {
            Assert.DoesNotContain("npm", line);
            Assert.DoesNotContain("ClientApp", line);
            Assert.DoesNotContain("configPage", line);
            Assert.DoesNotContain("rollup", line);
        }
    }
}
