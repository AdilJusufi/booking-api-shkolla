using System.Security.Cryptography;
using System.Text;

namespace Booking.Infrastructure.Services;

/// <summary>
/// Ndërtimi i vargut që nënshkruhet për ngarkimet e drejtpërdrejta në Cloudinary.
///
/// I ndarë nga ClinicAdminService sepse është pikërisht lloji i kodi që dështon në heshtje:
/// Cloudinary kërkon parametrat e renditur ALFABETIKISHT, dhe një radhë e gabuar prodhon
/// një nënshkrim krejt të vlefshëm në dukje që thjesht s'përputhet — ngarkimi refuzohet me
/// një gabim që nuk tregon aspak se shkaku ishte radha. Këtu është i testueshëm drejtpërdrejt.
/// </summary>
public static class CloudinaryUploadSignature
{
    /// <summary>
    /// Parametrat renditen alfabetikisht: allowed_formats, folder, invalidate, max_file_size,
    /// overwrite, public_id, timestamp. Nënshkruhen VETËM ata që dërgohen te upload-i; file,
    /// cloud_name, api_key dhe resource_type përjashtohen. overwrite dhe invalidate janë gjithmonë
    /// "true" — hyjnë në nënshkrim, kështu që klienti s'i heq dot. https://cloudinary.com/documentation/signatures
    /// </summary>
    public static string BuildParamsToSign(
        string allowedFormats, string folder, string publicId, long maxFileSizeBytes, long timestamp) =>
        $"allowed_formats={allowedFormats}"
        + $"&folder={folder}"
        + "&invalidate=true"
        + $"&max_file_size={maxFileSizeBytes}"
        + "&overwrite=true"
        + $"&public_id={publicId}"
        + $"&timestamp={timestamp}";

    /// <summary>SHA-1 mbi paramsToSign + api_secret, si hex me shkronja të vogla.</summary>
    public static string Compute(string paramsToSign, string apiSecret) =>
        Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(paramsToSign + apiSecret))).ToLowerInvariant();
}
