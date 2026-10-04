using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Booking.Application.Common.Models;
using Booking.Application.Features.Admin;
using Booking.Application.Features.Doctors;
using Booking.Infrastructure.Persistence;
using Booking.Infrastructure.Services;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// Logoja e klinikës ndjek të njëjtat rregulla si foto e mjekut: signed upload me public_id fiks,
/// dhe një URL e RE pranohet vetëm nëse është {RootFolder}/clinics/{ky id}/logo/current. URL-ja e
/// ruajtur më parë nuk rivlerësohet. overwrite/invalidate/public_id vendosen vetëm nga serveri.
/// </summary>
[Collection("api")]
public class ClinicLogoTests
{
    private const string CloudName = "test-cloud";
    private const string Root = "rezervomjekun/test";
    private const string LegacyUrl =
        $"https://res.cloudinary.com/{CloudName}/image/upload/v1700000000/clinics/22c99309-0000-0000-0000-000000000000/logo/legacy123.png";

    private static readonly Guid Dardania = DbSeeder.Ids.ClinicDardania;
    private static readonly Guid Sunny = DbSeeder.Ids.ClinicSunny;

    private readonly BookingApiFactory _factory;

    public ClinicLogoTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    private WebApplicationFactory<Program> WithCloudinary(bool configured = true) =>
        _factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.PostConfigure<CloudinarySettings>(o =>
            {
                o.CloudName = configured ? CloudName : "";
                o.ApiKey = configured ? "123456789" : "";
                o.ApiSecret = configured ? "test-secret" : "";
                o.RootFolder = configured ? Root : "";
            })));

    private static async Task<HttpClient> AdminAsync(WebApplicationFactory<Program> app)
    {
        var client = app.CreateClient();
        return client.WithToken((await TestHelpers.LoginAsync(
            client, DbSeeder.ClinicAdminEmail, BookingApiFactory.DefaultUserPassword)).AccessToken);
    }

    private static string LogoUrlFor(
        Guid clinicId, string cloud = CloudName, string ext = "png", string root = Root, string publicId = "current") =>
        $"https://res.cloudinary.com/{cloud}/image/upload/v1712345678/{root}/clinics/{clinicId}/logo/{publicId}.{ext}";

    private static Task<HttpResponseMessage> PutLogo(HttpClient client, string? url, string name = "Klinika Dentare Dardania") =>
        client.PutAsJsonAsync($"/api/admin/clinics/{Dardania}",
            new UpdateClinicRequest { Name = name, LogoUrl = url }, TestHelpers.Json);

    private async Task SetStoredLogoAsync(WebApplicationFactory<Program> app, string? url)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BookingDbContext>();
        await db.Clinics.Where(c => c.Id == Dardania).ExecuteUpdateAsync(s => s.SetProperty(c => c.LogoUrl, url));
    }

    private static async Task<string?> CodeOf(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;
    }

    // ---------- Nënshkrimi: vetëm serveri vendos fushat ----------

    [Fact]
    public async Task Clinic_signature_ignores_client_supplied_signed_fields()
    {
        var client = await AdminAsync(WithCloudinary());

        var response = await client.GetAsync(
            $"/api/admin/clinics/{Dardania}/upload-signature?folder=clinics/evil&public_id=evil&publicId=evil&overwrite=false&invalidate=false&allowed_formats=svg&max_file_size=999999999");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var signature = JsonSerializer.Deserialize<CloudinarySignatureDto>(
            await response.Content.ReadAsStringAsync(), TestHelpers.Json)!;
        signature.Folder.Should().Be($"{Root}/clinics/{Dardania}/logo");
        signature.PublicId.Should().Be("current");
        signature.Overwrite.Should().BeTrue();
        signature.Invalidate.Should().BeTrue();
        signature.AllowedFormats.Should().Be("png,jpg,jpeg,webp");
        signature.MaxFileSizeBytes.Should().Be(2 * 1024 * 1024);
    }

    [Fact]
    public async Task Doctor_signature_ignores_client_supplied_signed_fields()
    {
        var app = WithCloudinary();
        var client = app.CreateClient();
        client.WithToken((await TestHelpers.LoginAsync(
            client, DbSeeder.DoctorEmails[0], BookingApiFactory.DefaultUserPassword)).AccessToken);

        var response = await client.GetAsync(
            $"/api/doctors/{DbSeeder.Ids.DoctorArben}/photo/upload-signature?folder=evil&public_id=evil&publicId=evil&overwrite=false&invalidate=false");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var signature = JsonSerializer.Deserialize<CloudinarySignatureDto>(
            await response.Content.ReadAsStringAsync(), TestHelpers.Json)!;
        signature.Folder.Should().Be($"{Root}/doctors/{DbSeeder.Ids.DoctorArben}/photo");
        signature.PublicId.Should().Be("current");
        signature.Overwrite.Should().BeTrue();
        signature.Invalidate.Should().BeTrue();
    }

    // ---------- Ruajtja e logos ----------

    [Fact]
    public async Task Valid_new_logo_is_saved_and_can_be_removed()
    {
        var app = WithCloudinary();
        var client = await AdminAsync(app);
        var url = LogoUrlFor(Dardania);

        try
        {
            var save = await PutLogo(client, url);
            save.StatusCode.Should().Be(HttpStatusCode.OK);
            (await save.Content.ReadFromJsonAsync<AdminClinicDto>(TestHelpers.Json))!.LogoUrl.Should().Be(url);
        }
        finally
        {
            (await PutLogo(client, null)).StatusCode.Should().Be(HttpStatusCode.OK);
        }
    }

    public static TheoryData<string> RejectedUrls() => new()
    {
        // Cloud tjetër.
        LogoUrlFor(Dardania, cloud: "someone-else"),
        // Logoja e një klinike tjetër.
        LogoUrlFor(Sunny),
        // Mjedisi tjetër (e njëjta strukturë, rrënjë tjetër).
        LogoUrlFor(Dardania, root: "rezervomjekun/prod"),
        // Struktura e vjetër, pa rrënjë — e re, pra e refuzuar.
        $"https://res.cloudinary.com/{CloudName}/image/upload/v1712345678/clinics/{Dardania}/logo/abc123.png",
        $"https://res.cloudinary.com/{CloudName}/image/upload/v1712345678/clinics/{Dardania}/logo/current.png",
        // public_id tjetër nga "current".
        LogoUrlFor(Dardania, publicId: "abc123"),
        // SVG (mund të mbajë skript).
        LogoUrlFor(Dardania, ext: "svg"),
        // Pa version.
        $"https://res.cloudinary.com/{CloudName}/image/upload/{Root}/clinics/{Dardania}/logo/current.png",
        // Host tjetër, dhe http.
        $"https://evil.example/{Root}/clinics/{Dardania}/logo/current.png",
        LogoUrlFor(Dardania).Replace("https://", "http://"),
        // Traversim.
        $"https://res.cloudinary.com/{CloudName}/image/upload/v1/{Root}/clinics/{Dardania}/logo/../../{Sunny}/logo/current.png",
        // Transformim i futur para dosjes.
        $"https://res.cloudinary.com/{CloudName}/image/upload/l_text:x/v1/{Root}/clinics/{Dardania}/logo/current.png",
        // URL e çfarëdoshme.
        "https://tracker.example/pixel.png",
    };

    [Theory]
    [MemberData(nameof(RejectedUrls))]
    public async Task Rejects_new_logo_urls_outside_our_cloud_and_this_clinics_folder(string url)
    {
        var client = await AdminAsync(WithCloudinary());

        var response = await PutLogo(client, url);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await CodeOf(response)).Should().Be("invalid-logo-url");
    }

    // ---------- URL-ja e vjetër e ruajtur ----------

    [Fact]
    public async Task Already_saved_legacy_logo_is_kept_when_other_settings_change_but_a_different_legacy_url_is_rejected()
    {
        var app = WithCloudinary();
        var client = await AdminAsync(app);
        await SetStoredLogoAsync(app, LegacyUrl);

        try
        {
            // Frontend-i e ridërgon logoUrl ekzistues në çdo ruajtje të cilësimeve.
            var rename = await PutLogo(client, LegacyUrl, name: "Klinika Dentare Dardania");
            rename.StatusCode.Should().Be(HttpStatusCode.OK);
            (await rename.Content.ReadFromJsonAsync<AdminClinicDto>(TestHelpers.Json))!.LogoUrl.Should().Be(LegacyUrl);

            var other = await PutLogo(client, LegacyUrl.Replace("legacy123", "another"));
            other.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await CodeOf(other)).Should().Be("invalid-logo-url");
        }
        finally
        {
            await SetStoredLogoAsync(app, null);
        }
    }

    [Fact]
    public async Task Saving_settings_with_an_unchanged_logo_does_not_need_cloudinary_but_a_new_logo_does()
    {
        var app = WithCloudinary(configured: false);
        var client = await AdminAsync(app);
        await SetStoredLogoAsync(app, LegacyUrl);

        try
        {
            (await PutLogo(client, LegacyUrl)).StatusCode.Should().Be(HttpStatusCode.OK);

            var change = await PutLogo(client, LogoUrlFor(Dardania));
            change.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
            (await CodeOf(change)).Should().Be("uploads-not-configured");
        }
        finally
        {
            await SetStoredLogoAsync(app, null);
        }
    }
}
