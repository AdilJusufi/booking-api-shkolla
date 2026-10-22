using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Models;
using Booking.Application.Common.Security;
using Booking.Application.Features.Admin;
using Booking.Domain.Entities;
using Booking.Domain.Enums;
using Booking.Domain.Exceptions;
using Booking.Infrastructure.Identity;
using Booking.Infrastructure.Persistence;
using FluentValidation;
using FluentValidation.Results;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Booking.Infrastructure.Services;

/// <summary>
/// Kërkimi dhe krijimi i pacientëve nga recepsioni (rezervimi me telefon).
///
/// RREGULLAT E PRIVATËSISË (vendim i produktit, L-3):
///   • Kërkimi është VETËM përputhje e saktë me email ose telefon. S'ka kërkim me
///     emër, as të pjesshëm, as "fuzzy" — kush e di identifikuesin e saktë po
///     konfirmon dikë që e ka në telefon, nuk po shfleton bazën e pacientëve.
///   • Numrat normalizohen para krahasimit: hapësira, viza, "+383", "00383" dhe
///     zeroja e parë kombëtare s'kanë rëndësi ("044 765 432" = "+383 44 765 432").
///   • Për një pacient që s'ka pasur kurrë termin në klinikat e mia kthehet vetëm
///     emri + inicialja e mbiemrit ("Arben G.") dhe vetëm identifikuesi që u kërkua.
///     Mbiemri i plotë nuk del fare në përgjigje — maskimi bëhet këtu, në server.
///   • SuperAdmin i sheh të gjithë me detaje të plota — është operatori i platformës.
/// </summary>
public class AdminPatientService : IAdminPatientService
{
    /// <summary>
    /// Sa shifra fundore përdoren si filtër i parë në bazë (indeksueshëm dhe i lirë);
    /// krahasimi përfundimtar bëhet mbi numrin kombëtar të normalizuar, në memorie.
    /// </summary>
    private const int PhoneSuffixDigits = 8;

    private readonly BookingDbContext _dbContext;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly TenantAccessService _tenantAccess;
    private readonly IAuditService _auditService;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AdminPatientService(
        BookingDbContext dbContext,
        UserManager<ApplicationUser> userManager,
        TenantAccessService tenantAccess,
        IAuditService auditService,
        IDateTimeProvider dateTimeProvider)
    {
        _dbContext = dbContext;
        _userManager = userManager;
        _tenantAccess = tenantAccess;
        _auditService = auditService;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<PagedResult<AdminPatientSearchResultDto>> SearchAsync(
        AdminPatientSearchQuery query, CancellationToken cancellationToken = default)
    {
        var term = query.Query.Trim();
        var mode = DetectMode(term);
        if (mode is null)
        {
            throw new BookingRuleException(
                "patient-search-exact-only",
                "Kërkoni pacientin me numrin e plotë të telefonit ose me email-in e saktë.");
        }

        var matches = await FindPatientsAsync(term, mode.Value, cancellationToken);

        var items = matches
            .OrderBy(r => r.LastName).ThenBy(r => r.FirstName)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(r => ToSearchResult(r, mode.Value))
            .ToList();

        // Ekspozimi i të dhënave të pacientëve te stafi auditohet gjithmonë.
        // Termi ruhet me qëllim — "kush kërkoi kë" është e gjithë pika e auditit.
        _auditService.Record("PATIENT_SEARCHED_BY_ADMIN", nameof(PatientProfile), null, null,
            new { Query = term, Mode = mode.Value.ToString(), ResultCount = matches.Count });
        await _dbContext.SaveChangesAsync(cancellationToken);

        return new PagedResult<AdminPatientSearchResultDto>
        {
            Items = items,
            Page = query.Page,
            PageSize = query.PageSize,
            TotalItems = matches.Count
        };
    }

    public async Task<AdminPatientDto> CreateAsync(
        AdminCreatePatientRequest request, CancellationToken cancellationToken = default)
    {
        var email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim();
        var phone = request.PhoneNumber.Trim();

        // --- Pacienti ekziston tashmë? Përdore atë, mos krijo dublikat. ---
        // Telefoni është çelësi kryesor (shumica e thirrësve s'japin email); email-i pastaj.
        // Të dhënat e llogarisë ekzistuese NUK ndryshohen nga recepsioni.
        var existing = (await FindPatientsAsync(phone, SearchMode.Phone, cancellationToken)).FirstOrDefault();
        if (existing is null && email is not null)
        {
            existing = (await FindPatientsAsync(email, SearchMode.Email, cancellationToken)).FirstOrDefault();
        }

        if (existing is not null)
        {
            _auditService.Record("PATIENT_REUSED_BY_ADMIN", nameof(PatientProfile), existing.PatientProfileId.ToString(), null,
                new { MatchedOn = existing.Phone is not null && PhonesMatch(existing.Phone, phone) ? "phone" : "email" });
            await _dbContext.SaveChangesAsync(cancellationToken);
            return ToPatientDto(existing, isExisting: true);
        }

        // Email-i i një llogarie që S'ËSHTË pacient (doktor, admin) — s'e përdorim dot.
        if (email is not null && await _userManager.FindByEmailAsync(email) is not null)
        {
            throw new ConflictException(
                "email-exists", "Ky email i përket një llogarie tjetër që nuk është pacient. Përdorni një email tjetër ose lëreni bosh.");
        }

        // --- Llogaria ---
        // Krijohet PA password: pacienti s'zgjodhi kurrë një, dhe leximi i një password-i
        // të gjeneruar në telefon është njëkohësisht i pasigurt dhe i papërdorshëm.
        // Me email, pacienti e merr llogarinë në dorëzim vetë përmes "kam harruar fjalëkalimin";
        // pa email llogaria s'ka fare hyrje. S'dërgohet email "mirëseardhje" — konfirmimi i
        // terminit mjafton (kursen kuotën e Resend-it).
        var user = new ApplicationUser
        {
            // Pa email, UserName bie te telefoni — por i pastruar nga formatimi:
            // Identity.User.AllowedUserNameCharacters nuk i lejon hapësirat.
            UserName = email ?? UserNameFromPhone(phone),
            Email = email,
            PhoneNumber = phone,
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            // Konfirmim email-i s'ka kuptim për një llogari që e hapi vetë klinika.
            EmailConfirmed = email is not null,
            CreatedAt = _dateTimeProvider.UtcNow
        };

        IdentityResult createResult;
        try
        {
            createResult = await _userManager.CreateAsync(user);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        {
            // Indeksi unik mbi NormalizedEmail/UserName — dy kërkesa paralele me të njëjtin kontakt.
            throw new ConflictException(
                "patient-exists", "Ky pacient sapo u krijua nga dikush tjetër. Kërkojeni me telefon ose email.");
        }

        if (!createResult.Succeeded)
        {
            if (createResult.Errors.Any(e => e.Code is "DuplicateUserName" or "DuplicateEmail"))
            {
                throw new ConflictException(
                    "patient-exists", "Ekziston tashmë një llogari me këtë kontakt. Kërkojeni me telefon ose email.");
            }

            throw new ValidationException(
                createResult.Errors.Select(e => new ValidationFailure(e.Code, e.Description)).ToList());
        }

        await _userManager.AddToRoleAsync(user, Roles.Patient);

        var profile = new PatientProfile
        {
            UserId = user.Id,
            DateOfBirth = request.DateOfBirth,
            Gender = request.Gender,
            Address = string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim(),
            City = string.IsNullOrWhiteSpace(request.City) ? null : request.City.Trim()
        };
        _dbContext.PatientProfiles.Add(profile);

        // Pa PersonalNumber dhe pa asnjë fushë të ndjeshme në audit.
        _auditService.Record("PATIENT_CREATED_BY_ADMIN", nameof(PatientProfile), profile.Id.ToString(), null,
            new { UserId = user.Id, Email = email, PhoneNumber = phone, HasEmail = email is not null });

        await _dbContext.SaveChangesAsync(cancellationToken);

        return new AdminPatientDto
        {
            PatientProfileId = profile.Id,
            UserId = user.Id,
            FirstName = user.FirstName,
            LastName = user.LastName,
            Email = user.Email,
            PhoneNumber = phone,
            DateOfBirth = profile.DateOfBirth,
            Gender = profile.Gender,
            IsUnclaimedAccount = true,
            IsExistingPatient = false,
            IsNameMasked = false,
            HasRelationshipWithClinic = false
        };
    }

    // ---------- Gjetja ----------

    private sealed record PatientMatch(
        Guid PatientProfileId,
        Guid UserId,
        string FirstName,
        string LastName,
        string? Email,
        string? Phone,
        DateOnly? DateOfBirth,
        Gender? Gender,
        bool IsUnclaimed,
        bool HasRelationship,
        IReadOnlyList<AdminPatientDependentDto> Dependents);

    private async Task<List<PatientMatch>> FindPatientsAsync(
        string term, SearchMode mode, CancellationToken cancellationToken)
    {
        var currentUserId = _tenantAccess.CurrentUserId;
        var isSuperAdmin = _tenantAccess.IsSuperAdmin;

        // Pacientët = userat aktivë me profil pacienti. IsActive përputhet me
        // rregullin e krijimit të terminit, që gjithashtu kërkon user aktiv.
        var rows =
            from p in _dbContext.PatientProfiles
            join u in _dbContext.Users on p.UserId equals u.Id
            where u.IsActive
            select new { Profile = p, User = u };

        if (mode == SearchMode.Email)
        {
            var normalizedEmail = _userManager.NormalizeEmail(term);
            rows = rows.Where(r => r.User.NormalizedEmail == normalizedEmail);
        }
        else
        {
            var national = NationalPhone(term);
            if (national.Length < PhoneSuffixDigits)
            {
                return [];
            }

            // Filtri i parë në bazë mbi bishtin; krahasimi i saktë më poshtë, në memorie.
            var suffix = national[^PhoneSuffixDigits..];
            rows = rows.Where(r => r.User.PhoneNumber != null
                && r.User.PhoneNumber
                    .Replace(" ", "").Replace("-", "").Replace("(", "")
                    .Replace(")", "").Replace(".", "").Replace("+", "").Replace("/", "")
                    .EndsWith(suffix));
        }

        var candidates = await rows
            .Select(r => new
            {
                PatientProfileId = r.Profile.Id,
                UserId = r.User.Id,
                r.User.FirstName,
                r.User.LastName,
                r.User.Email,
                r.User.PhoneNumber,
                r.Profile.DateOfBirth,
                r.Profile.Gender,
                // Password i pavendosur = llogari e hapur nga administrata që pacienti
                // s'e ka marrë ende në dorëzim. S'na duhet kolonë e re për këtë.
                IsUnclaimed = r.User.PasswordHash == null,
                HasRelationship = isSuperAdmin || _dbContext.Appointments.Any(a =>
                    a.PatientProfileId == r.Profile.Id
                    && _dbContext.ClinicAdministrators.Any(ca =>
                        ca.UserId == currentUserId && ca.ClinicId == a.ClinicId)),
                Dependents = r.Profile.Dependents
                    .Where(d => d.IsActive)
                    .Select(d => new AdminPatientDependentDto
                    {
                        Id = d.Id,
                        FirstName = d.FirstName,
                        LastName = d.LastName,
                        DateOfBirth = d.DateOfBirth,
                        Gender = d.Gender,
                        Relationship = d.Relationship
                    })
                    .ToList()
            })
            .ToListAsync(cancellationToken);

        return candidates
            .Where(c => mode == SearchMode.Email || (c.PhoneNumber is not null && PhonesMatch(c.PhoneNumber, term)))
            .Select(c => new PatientMatch(
                c.PatientProfileId, c.UserId, c.FirstName, c.LastName, c.Email, c.PhoneNumber,
                c.DateOfBirth, c.Gender, c.IsUnclaimed, c.HasRelationship, c.Dependents))
            .ToList();
    }

    private static AdminPatientSearchResultDto ToSearchResult(PatientMatch r, SearchMode mode) => new()
    {
        PatientProfileId = r.PatientProfileId,
        FirstName = r.FirstName,
        // Pa lidhje me klinikën: vetëm inicialja — mbiemri i plotë s'del nga serveri.
        LastName = r.HasRelationship ? r.LastName : MaskLastName(r.LastName),
        IsNameMasked = !r.HasRelationship,
        // Pa lidhje kthehet vetëm identifikuesi që u kërkua: admini tashmë e dinte.
        Email = r.HasRelationship || mode == SearchMode.Email ? r.Email : null,
        PhoneNumber = r.HasRelationship || mode == SearchMode.Phone ? r.Phone : null,
        DateOfBirth = r.HasRelationship ? r.DateOfBirth : null,
        HasRelationshipWithClinic = r.HasRelationship,
        IsUnclaimedAccount = r.IsUnclaimed,
        Dependents = r.HasRelationship ? r.Dependents : Array.Empty<AdminPatientDependentDto>(),
    };

    private static AdminPatientDto ToPatientDto(PatientMatch r, bool isExisting) => new()
    {
        PatientProfileId = r.PatientProfileId,
        UserId = r.UserId,
        FirstName = r.FirstName,
        LastName = r.HasRelationship ? r.LastName : MaskLastName(r.LastName),
        Email = r.HasRelationship ? r.Email : null,
        PhoneNumber = r.HasRelationship ? r.Phone : null,
        DateOfBirth = r.HasRelationship ? r.DateOfBirth : null,
        Gender = r.HasRelationship ? r.Gender : null,
        IsUnclaimedAccount = r.IsUnclaimed,
        IsExistingPatient = isExisting,
        IsNameMasked = !r.HasRelationship,
        HasRelationshipWithClinic = r.HasRelationship,
        Dependents = r.HasRelationship ? r.Dependents : Array.Empty<AdminPatientDependentDto>()
    };

    // ---------- Ndihmës ----------

    private enum SearchMode
    {
        Email,
        Phone
    }

    /// <summary>Email ose telefon i plotë; çdo gjë tjetër (emra, fragmente) refuzohet.</summary>
    private static SearchMode? DetectMode(string term)
    {
        if (term.Contains('@'))
        {
            return SearchMode.Email;
        }

        var looksNumeric = term.All(c => char.IsDigit(c) || c is '+' or ' ' or '-' or '(' or ')' or '.' or '/');
        return looksNumeric && NationalPhone(term).Length >= PhoneSuffixDigits ? SearchMode.Phone : null;
    }

    /// <summary>"Arben G." — inicialja e mbiemrit, pa asgjë tjetër.</summary>
    internal static string MaskLastName(string lastName)
    {
        var trimmed = lastName.Trim();
        return trimmed.Length == 0 ? string.Empty : $"{char.ToUpperInvariant(trimmed[0])}.";
    }

    /// <summary>
    /// Numri kombëtar i Kosovës pa formatim: "+383 44 765 432", "00383 44 765 432",
    /// "044-765-432" → "44765432". Numrat e huaj mbeten me prefiksin e tyre.
    /// </summary>
    internal static string NationalPhone(string phone)
    {
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        if (digits.StartsWith("00"))
        {
            digits = digits[2..];
        }

        if (digits.StartsWith("383") && digits.Length >= 11)
        {
            digits = digits[3..];
        }

        return digits.TrimStart('0');
    }

    internal static bool PhonesMatch(string a, string b)
    {
        var na = NationalPhone(a);
        return na.Length >= PhoneSuffixDigits && na == NationalPhone(b);
    }

    /// <summary>
    /// Telefoni në formë të pranueshme si UserName: vetëm shifra, me "+" prijës kur
    /// numri e kishte. Formatimi hiqet edhe që i njëjti numër i shkruar ndryshe të
    /// japë të njëjtin UserName.
    /// </summary>
    private static string UserNameFromPhone(string phone)
    {
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        return phone.TrimStart().StartsWith('+') ? "+" + digits : digits;
    }
}
