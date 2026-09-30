using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Booking.Application.Common.Models;
using Booking.Application.Features.Doctors;
using Booking.Infrastructure.Persistence;
using Booking.Infrastructure.Services;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// Fotoja e mjekut: kush mund ta ndryshojë (pronësia, jo roli), që dosja e nënshkrimit
/// është fikse në server, që ruhet vetëm një URL nga cloud-i ynë dhe dosja e mjekut, dhe
/// që mungesa e konfigurimit të Cloudinary jep 503 të qartë, jo 500.
///
/// Seed-i: admini i Dardanias menaxhon Arbenin (dega Dardania), jo Elirën (Sunny).
/// </summary>
[Collection("api")]
public class DoctorPhotoTests
{
    private const string CloudName = "test-cloud";
    private const string ApiSecret = "test-secret-qe-s-duhet-te-dale-kurre";

    private static readonly Guid Arben = DbSeeder.Ids.DoctorArben;
    private static readonly Guid Elira = DbSeeder.Ids.DoctorElira;

    private readonly BookingApiFactory _factory;

    public DoctorPhotoTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    private WebApplicationFactory<Program> WithCloudinary(bool configured) =>
        _factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.PostConfigure<CloudinarySettings>(o =>
            {
                o.CloudName = configured ? CloudName : "";
                o.ApiKey = configured ? "123456789" : "";
                o.ApiSecret = configured ? ApiSecret : "";
            })));

    private static async Task<HttpClient> SignInAsync(WebApplicationFactory<Program> app, string email, string password)
    {
        var client = app.CreateClient();
        return client.WithToken((await TestHelpers.LoginAsync(client, email, password)).AccessToken);
    }

    private static Task<HttpClient> ArbenAsync(WebApplicationFactory<Program> app) =>
        SignInAsync(app, DbSeeder.DoctorEmails[0], BookingApiFactory.DefaultUserPassword);

    private static Task<HttpClient> DardaniaAdminAsync(WebApplicationFactory<Program> app) =>
        SignInAsync(app, DbSeeder.ClinicAdminEmail, BookingApiFactory.DefaultUserPassword);

    private static string PhotoUrlFor(Guid doctorId, string cloud = CloudName, string ext = "jpg") =>
        $"https://res.cloudinary.com/{cloud}/image/upload/v1712345678/doctors/{doctorId}/photo/abc123XYZ.{ext}";

    // ---------- Kush e merr nënshkrimin ----------

    [Fact]
    public async Task Doctor_gets_signature_for_own_fixed_folder_without_the_secret()
    {
        var client = await ArbenAsync(WithCloudinary(configured: true));

        // Një "folder" nga klienti injorohet: dosja caktohet vetëm në server.
        var response = await client.GetAsync($"/api/doctors/{Arben}/photo/upload-signature?folder=clinics/evil");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadAsStringAsync();
        body.Should().NotContain(ApiSecret);

        var signature = JsonSerializer.Deserialize<CloudinarySignatureDto>(body, TestHelpers.Json)!;
        signature.Folder.Should().Be($"doctors/{Arben}/photo");
        signature.AllowedFormats.Should().Be("jpg,jpeg,png,webp");
        signature.MaxFileSizeBytes.Should().Be(5 * 1024 * 1024);
        signature.CloudName.Should().Be(CloudName);
    }

    [Fact]
    public async Task Admin_of_the_doctors_clinic_gets_signature()
    {
        var client = await DardaniaAdminAsync(WithCloudinary(configured: true));

        var response = await client.GetAsync($"/api/doctors/{Arben}/photo/upload-signature");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Admin_of_another_clinic_is_forbidden()
    {
        var client = await DardaniaAdminAsync(WithCloudinary(configured: true));

        var signature = await client.GetAsync($"/api/doctors/{Elira}/photo/upload-signature");
        var save = await client.PutAsJsonAsync($"/api/doctors/{Elira}/photo",
            new SetDoctorPhotoRequest { PhotoUrl = PhotoUrlFor(Elira) }, TestHelpers.Json);

        signature.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        save.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Patient_is_forbidden()
    {
        var app = WithCloudinary(configured: true);
        var client = app.CreateClient();
        client.WithToken((await TestHelpers.RegisterPatientAsync(client)).AccessToken);

        var signature = await client.GetAsync($"/api/doctors/{Arben}/photo/upload-signature");
        var save = await client.PutAsJsonAsync($"/api/doctors/{Arben}/photo",
            new SetDoctorPhotoRequest { PhotoUrl = PhotoUrlFor(Arben) }, TestHelpers.Json);

        signature.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        save.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Another_doctor_is_forbidden()
    {
        // Blerta punon në të njëjtën klinikë, por s'është as Arbeni as admin.
        var client = await SignInAsync(WithCloudinary(configured: true),
            DbSeeder.DoctorEmails[1], BookingApiFactory.DefaultUserPassword);

        var response = await client.GetAsync($"/api/doctors/{Arben}/photo/upload-signature");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Anonymous_is_unauthorized()
    {
        var response = await WithCloudinary(configured: true).CreateClient()
            .GetAsync($"/api/doctors/{Arben}/photo/upload-signature");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ---------- Konfigurimi që mungon ----------

    [Fact]
    public async Task Missing_cloudinary_config_returns_503_with_code_for_doctor_photo()
    {
        var client = await ArbenAsync(WithCloudinary(configured: false));

        var response = await client.GetAsync($"/api/doctors/{Arben}/photo/upload-signature");

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        (await CodeOf(response)).Should().Be("uploads-not-configured");
    }

    [Fact]
    public async Task Missing_cloudinary_config_returns_503_with_code_for_clinic_logo()
    {
        var client = await DardaniaAdminAsync(WithCloudinary(configured: false));

        var response = await client.GetAsync($"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}/upload-signature");

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        (await CodeOf(response)).Should().Be("uploads-not-configured");
    }

    [Fact]
    public async Task Ownership_is_checked_before_config_so_strangers_learn_nothing()
    {
        var client = await DardaniaAdminAsync(WithCloudinary(configured: false));

        var response = await client.GetAsync($"/api/doctors/{Elira}/photo/upload-signature");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ---------- Ruajtja ----------

    [Fact]
    public async Task Saved_photo_shows_on_public_profile_listing_and_own_profile_then_can_be_removed()
    {
        var app = WithCloudinary(configured: true);
        var client = await ArbenAsync(app);
        var url = PhotoUrlFor(Arben);

        try
        {
            var save = await client.PutAsJsonAsync($"/api/doctors/{Arben}/photo",
                new SetDoctorPhotoRequest { PhotoUrl = url }, TestHelpers.Json);
            save.StatusCode.Should().Be(HttpStatusCode.OK);

            var details = await client.GetFromJsonAsync<DoctorDetailsDto>($"/api/doctors/{Arben}", TestHelpers.Json);
            details!.PhotoUrl.Should().Be(url);

            var own = await client.GetFromJsonAsync<DoctorSelfProfileDto>("/api/doctor/me", TestHelpers.Json);
            own!.Id.Should().Be(Arben);
            own.PhotoUrl.Should().Be(url);

            var list = await client.GetFromJsonAsync<PagedResult<DoctorDto>>(
                "/api/doctors?searchTerm=Arben", TestHelpers.Json);
            list!.Items.Single(d => d.Id == Arben).PhotoUrl.Should().Be(url);
        }
        finally
        {
            var remove = await client.PutAsJsonAsync($"/api/doctors/{Arben}/photo",
                new SetDoctorPhotoRequest { PhotoUrl = null }, TestHelpers.Json);
            remove.StatusCode.Should().Be(HttpStatusCode.OK);
        }

        var after = await client.GetFromJsonAsync<DoctorDetailsDto>($"/api/doctors/{Arben}", TestHelpers.Json);
        after!.PhotoUrl.Should().BeNull();
    }

    [Fact]
    public async Task Admin_of_the_doctors_clinic_can_save_photo()
    {
        var client = await DardaniaAdminAsync(WithCloudinary(configured: true));

        var response = await client.PutAsJsonAsync($"/api/doctors/{Arben}/photo",
            new SetDoctorPhotoRequest { PhotoUrl = null }, TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    public static TheoryData<string> ForeignUrls() => new()
    {
        // Cloud tjetër.
        PhotoUrlFor(Arben, cloud: "someone-else"),
        // Dosja e një mjeku tjetër.
        PhotoUrlFor(Elira),
        // Format që s'lejohet (SVG mund të mbajë skript).
        PhotoUrlFor(Arben, ext: "svg"),
        // Host krejt tjetër.
        $"https://evil.example/doctors/{Arben}/photo/abc.jpg",
        // http, jo https.
        PhotoUrlFor(Arben).Replace("https://", "http://"),
        // Nën-dosje / traversim.
        $"https://res.cloudinary.com/{CloudName}/image/upload/doctors/{Arben}/photo/../../{Elira}/photo/a.jpg",
        // Transformim i futur para dosjes.
        $"https://res.cloudinary.com/{CloudName}/image/upload/l_text:x/doctors/{Arben}/photo/a.jpg",
    };

    [Theory]
    [MemberData(nameof(ForeignUrls))]
    public async Task Rejects_urls_outside_our_cloud_and_the_doctors_folder(string url)
    {
        var client = await ArbenAsync(WithCloudinary(configured: true));

        var response = await client.PutAsJsonAsync($"/api/doctors/{Arben}/photo",
            new SetDoctorPhotoRequest { PhotoUrl = url }, TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await CodeOf(response)).Should().Be("invalid-photo-url");
    }

    private static async Task<string?> CodeOf(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;
    }
}
