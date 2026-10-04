using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Infrastructure.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace Booking.Tests.Unit.Infrastructure;

/// <summary>
/// Cloudinary__RootFolder (e detyrueshme, pa default): ngarkimet dhe validimi i URL-ve pranojnë
/// vetëm dosjen e këtij mjedisi; mungesa ose një vlerë e pavlefshme jep 503, jo rënie te rrënja.
/// </summary>
public class CloudinaryUploadSignerTests
{
    private const string Cloud = "democloud";
    private const string Root = "rezervomjekun/dev";
    private static readonly Guid DoctorId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid ClinicId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly string[] Formats = ["jpg", "png"];

    private static string Url(string folder, string publicId = "current", string version = "v123/") =>
        $"https://res.cloudinary.com/{Cloud}/image/upload/{version}{folder}/{publicId}.jpg";

    private static CloudinaryUploadSigner CreateSigner(string root, Mock<ILogger<CloudinaryUploadSigner>>? logger = null)
    {
        var clock = new Mock<IDateTimeProvider>();
        clock.SetupGet(c => c.UtcNow).Returns(new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));

        return new CloudinaryUploadSigner(
            Options.Create(new CloudinarySettings
            {
                CloudName = Cloud, ApiKey = "key", ApiSecret = "secret", RootFolder = root
            }),
            clock.Object,
            (logger ?? new Mock<ILogger<CloudinaryUploadSigner>>()).Object);
    }

    // ---------- Validimi i URL-ve ----------

    [Fact]
    public void Accepts_the_exact_current_url_in_this_environments_folder()
        => CreateSigner(Root).IsOwnImageUrl(Url($"{Root}/doctors/{DoctorId}/photo"),
            CloudinaryFolders.DoctorPhoto(DoctorId), Formats).Should().BeTrue();

    [Fact]
    public void Rejects_url_from_the_other_environment()
        => CreateSigner(Root).IsOwnImageUrl(Url($"rezervomjekun/prod/doctors/{DoctorId}/photo"),
            CloudinaryFolders.DoctorPhoto(DoctorId), Formats).Should().BeFalse();

    [Fact]
    public void Rejects_old_structure_without_root_folder()
        => CreateSigner(Root).IsOwnImageUrl(Url($"doctors/{DoctorId}/photo", publicId: "abc123"),
            CloudinaryFolders.DoctorPhoto(DoctorId), Formats).Should().BeFalse();

    [Fact]
    public void Rejects_public_id_other_than_current()
        => CreateSigner(Root).IsOwnImageUrl(Url($"{Root}/doctors/{DoctorId}/photo", publicId: "abc123"),
            CloudinaryFolders.DoctorPhoto(DoctorId), Formats).Should().BeFalse();

    [Fact]
    public void Rejects_url_without_version()
        => CreateSigner(Root).IsOwnImageUrl(Url($"{Root}/doctors/{DoctorId}/photo", version: ""),
            CloudinaryFolders.DoctorPhoto(DoctorId), Formats).Should().BeFalse();

    [Fact]
    public void Rejects_another_entitys_folder()
        => CreateSigner(Root).IsOwnImageUrl(Url($"{Root}/doctors/{Guid.NewGuid()}/photo"),
            CloudinaryFolders.DoctorPhoto(DoctorId), Formats).Should().BeFalse();

    [Fact]
    public void Root_folder_is_matched_literally_not_as_a_regex()
        => CreateSigner("rezervomjekun/dev").IsOwnImageUrl(Url($"rezervomjekunXdev/doctors/{DoctorId}/photo"),
            CloudinaryFolders.DoctorPhoto(DoctorId), Formats).Should().BeFalse();

    // ---------- Nënshkrimi ----------

    [Fact]
    public void Signature_carries_root_folder_fixed_public_id_overwrite_and_invalidate()
    {
        var dto = CreateSigner(Root).Sign(CloudinaryFolders.ClinicLogo(ClinicId), Formats, 1024);

        dto.Folder.Should().Be($"{Root}/clinics/{ClinicId}/logo");
        dto.PublicId.Should().Be("current");
        dto.Overwrite.Should().BeTrue();
        dto.Invalidate.Should().BeTrue();
    }

    [Fact]
    public void Signature_differs_between_environments_for_the_same_entity()
    {
        var dev = CreateSigner("rezervomjekun/dev").Sign(CloudinaryFolders.DoctorPhoto(DoctorId), Formats, 1024);
        var prod = CreateSigner("rezervomjekun/prod").Sign(CloudinaryFolders.DoctorPhoto(DoctorId), Formats, 1024);

        dev.Signature.Should().NotBe(prod.Signature);
        prod.Folder.Should().Be($"rezervomjekun/prod/doctors/{DoctorId}/photo");
    }

    // ---------- RootFolder i detyrueshëm / i vlefshëm ----------

    [Fact]
    public void Missing_root_folder_throws_uploads_not_configured_and_logs_the_variable_name()
    {
        var logger = new Mock<ILogger<CloudinaryUploadSigner>>();

        var act = () => CreateSigner("", logger).Sign(CloudinaryFolders.DoctorPhoto(DoctorId), Formats, 1024);

        act.Should().Throw<UploadsNotConfiguredException>();
        LoggedErrorContaining(logger, "Cloudinary__RootFolder").Should().BeTrue();
    }

    [Theory]
    [InlineData("..")]
    [InlineData("rezervomjekun/../prod")]
    [InlineData("/rezervomjekun/dev")]
    [InlineData("rezervomjekun/dev/")]
    [InlineData("Rezervomjekun/Dev")]
    [InlineData("rezervomjekun//dev")]
    [InlineData("rezervo mjekun")]
    [InlineData("rezervomjekun/dev.x")]
    public void Invalid_root_folder_throws_uploads_not_configured_for_both_sign_and_validate(string root)
    {
        var logger = new Mock<ILogger<CloudinaryUploadSigner>>();
        var signer = CreateSigner(root, logger);

        var sign = () => signer.Sign(CloudinaryFolders.DoctorPhoto(DoctorId), Formats, 1024);
        var validate = () => signer.IsOwnImageUrl(Url("x"), CloudinaryFolders.DoctorPhoto(DoctorId), Formats);

        sign.Should().Throw<UploadsNotConfiguredException>();
        validate.Should().Throw<UploadsNotConfiguredException>();
        LoggedErrorContaining(logger, "Cloudinary__RootFolder").Should().BeTrue();
    }

    [Theory]
    [InlineData("rezervomjekun/prod")]
    [InlineData("rezervomjekun/dev")]
    [InlineData("a-b/c-1")]
    public void Valid_root_folders_are_accepted(string root)
        => CloudinaryFolders.IsValidRoot(root).Should().BeTrue();

    private static bool LoggedErrorContaining(Mock<ILogger<CloudinaryUploadSigner>> logger, string text) =>
        logger.Invocations.Any(i =>
            i.Method.Name == nameof(ILogger.Log)
            && i.Arguments[0] is LogLevel.Error
            && (i.Arguments[2]?.ToString() ?? "").Contains(text));
}
