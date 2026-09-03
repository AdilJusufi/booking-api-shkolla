using System.Security.Cryptography;
using System.Text;
using Booking.Infrastructure.Services;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Unit.Infrastructure;

/// <summary>
/// allowed_formats dhe max_file_size u futën brenda nënshkrimit që kufijtë e ngarkimit të
/// mos jenë thjesht kontrolle në frontend: nënshkrimi lëshohet nga API-ja jonë, por skedari
/// shkon DREJT te Cloudinary. Nëse këto dy fusha s'janë të nënshkruara, kushdo me
/// nënshkrimin mund të ngarkonte çfarëdo formati dhe madhësie.
/// </summary>
public class CloudinaryUploadSignatureTests
{
    private const string Formats = "png,jpg,jpeg,webp";
    private const string Folder = "clinics/11111111-1111-1111-1111-111111111111/logo";
    private const long MaxBytes = 2 * 1024 * 1024;
    private const long Timestamp = 1_800_000_000;

    [Fact]
    public void Signed_parameters_are_in_alphabetical_order()
    {
        var actual = CloudinaryUploadSignature.BuildParamsToSign(Formats, Folder, MaxBytes, Timestamp);

        actual.Should().Be(
            $"allowed_formats={Formats}&folder={Folder}&max_file_size={MaxBytes}&timestamp={Timestamp}");

        // Renditja shprehur si kërkesë më vete: Cloudinary e refuzon nënshkrimin nëse
        // çelësat s'janë alfabetikë, dhe gabimi që kthen nuk e përmend fare radhën.
        var keys = actual.Split('&').Select(p => p.Split('=')[0]).ToList();
        keys.Should().BeInAscendingOrder();
    }

    [Fact]
    public void Both_new_restrictions_are_actually_inside_the_signed_string()
    {
        var actual = CloudinaryUploadSignature.BuildParamsToSign(Formats, Folder, MaxBytes, Timestamp);

        actual.Should().Contain("allowed_formats=").And.Contain("max_file_size=");
    }

    [Fact]
    public void Signature_is_sha1_of_params_plus_secret()
    {
        var paramsToSign = CloudinaryUploadSignature.BuildParamsToSign(Formats, Folder, MaxBytes, Timestamp);

        var expected = Convert
            .ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(paramsToSign + "the-secret")))
            .ToLowerInvariant();

        CloudinaryUploadSignature.Compute(paramsToSign, "the-secret").Should().Be(expected);
    }

    /// <summary>
    /// Kjo është vetë garancia: klienti i merr këto vlera dhe duhet t'i dërgojë ashtu siç
    /// janë. Po i ndryshoi — p.sh. shtoi "svg" ose ngriti kufirin — nënshkrimi s'përputhet
    /// më dhe Cloudinary e refuzon ngarkimin.
    /// </summary>
    [Theory]
    [InlineData("png,jpg,jpeg,webp,svg", Folder, MaxBytes)]
    [InlineData(Formats, Folder, 50 * 1024 * 1024L)]
    [InlineData(Formats, "clinics/someone-elses-clinic/logo", MaxBytes)]
    public void Tampering_with_any_signed_value_changes_the_signature(
        string formats, string folder, long maxBytes)
    {
        var honest = CloudinaryUploadSignature.Compute(
            CloudinaryUploadSignature.BuildParamsToSign(Formats, Folder, MaxBytes, Timestamp), "s3cret");

        var tampered = CloudinaryUploadSignature.Compute(
            CloudinaryUploadSignature.BuildParamsToSign(formats, folder, maxBytes, Timestamp), "s3cret");

        tampered.Should().NotBe(honest);
    }
}
