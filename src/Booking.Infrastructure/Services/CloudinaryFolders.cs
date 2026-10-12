using System.Text.RegularExpressions;

namespace Booking.Infrastructure.Services;

/// <summary>
/// E vetmja pikë ku ndërtohen shtigjet e Cloudinary — si nënshkruesi ashtu edhe validimi i
/// URL-ve përdorin vetëm këtë klasë, kështu që nuk ka kurrë dy versione të të njëjtit shteg.
///
/// Struktura (rrënja = Cloudinary__RootFolder, p.sh. "rezervomjekun/prod" ose "rezervomjekun/dev"):
///   {root}/clinics/{clinicId}/logo/current     ← në përdorim
///   {root}/doctors/{doctorId}/photo/current    ← në përdorim
/// Të rezervuara (dokumentuara te ENVIRONMENTS.md, JO të ndërtuara): clinics/{id}/cover,
/// clinics/{id}/gallery, branches/{id}/photo, users/{id}/avatar, system/.
///
/// DOKUMENTET MJEKËSORE TË PACIENTËVE NUK HYJNË KURRË NË KËTË STRUKTURË. Çdo gjë këtu është
/// asset publik "upload" — kushdo me URL-në e lexon. Nëse ndonjëherë duhen dokumente, kërkojnë
/// `type: authenticated` dhe një dizajn të veçantë.
/// </summary>
public static class CloudinaryFolders
{
    /// <summary>public_id fiks: një ngarkim i ri e zëvendëson të vjetrin (overwrite), pa imazhe të papërdorura.</summary>
    public const string PublicId = "current";

    // Vetëm a-z0-9 dhe "-" brenda segmenteve të ndara me "/": përjashton "..", "/" në fillim ose
    // në fund, segmente bosh, shkronja të mëdha dhe çdo karakter tjetër.
    private static readonly Regex RootPattern =
        new("^[a-z0-9-]+(?:/[a-z0-9-]+)*$", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));

    public static bool IsValidRoot(string? root) => root is not null && RootPattern.IsMatch(root);

    public static string ClinicLogo(Guid clinicId) => $"clinics/{clinicId}/logo";

    public static string DoctorPhoto(Guid doctorId) => $"doctors/{doctorId}/photo";

    /// <summary>Shtegu i plotë i dosjes: {root}/{relative}. Rrënja duhet të jetë verifikuar paraprakisht.</summary>
    public static string Combine(string root, string relativeFolder) => $"{root}/{relativeFolder}";
}
