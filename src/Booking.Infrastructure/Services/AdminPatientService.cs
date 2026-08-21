using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Models;
using Booking.Application.Common.Security;
using Booking.Application.Features.Admin;
using Booking.Domain.Entities;
using Booking.Infrastructure.Identity;
using Booking.Infrastructure.Persistence;
using FluentValidation;
using FluentValidation.Results;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Booking.Infrastructure.Services;

/// <summary>
/// Kërkimi dhe krijimi i pacientëve nga recepsioni.
///
/// SHTRIRJA E KËRKIMIT (vendim i qëllimshëm, jo teknik):
/// një recepsioniste duhet të gjejë edhe një thirrës që s'ka qenë kurrë në klinikë —
/// ndryshe rezervimi me telefon s'funksionon fare. Por kërkim i lirë global mbi
/// emrat do të thotë shfletim i lirë i bazës së pacientëve. Prandaj:
///
///   • Email ose telefon i plotë → kërkim global. Kush e di identifikuesin e saktë
///     nuk po shfleton, po konfirmon dikë që e ka në telefon. Për pacientët pa
///     lidhje me klinikën kthehet vetëm identifikuesi që u kërkua — pa datëlindje,
///     pa dependentë, pa kontaktin tjetër.
///   • Pjesë emri → vetëm pacientët që kanë tashmë një termin në klinikat e mia.
///     Kërkimi i pjesshëm është ai që mundëson enumerimin, prandaj mbetet i mbyllur.
///
/// SuperAdmin i sheh të gjithë me detaje të plota — është operatori i platformës.
/// </summary>
public class AdminPatientService : IAdminPatientService
{
    /// <summary>
    /// Sa shifra fundore duhen për ta quajtur një numër telefoni "të njëjtë".
    /// Formatet ndryshojnë (+383 44 000 000 vs 044 000 000), prandaj krahasohet
    /// bishti: 8 shifra janë mjaft specifike dhe kapërcejnë prefiksin e shtetit.
    /// </summary>
    private const int PhoneMatchDigits = 8;

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

        var currentUserId = _tenantAccess.CurrentUserId;
        var isSuperAdmin = _tenantAccess.IsSuperAdmin;

        // Të gjitha vlerat e krahasimit llogariten JASHTË shprehjes — brenda saj do të
        // ishin thirrje metodash që EF-ja s'i përkthen dot.
        var normalizedEmail = _userManager.NormalizeEmail(term);
        var phoneSuffix = PhoneSuffix(term);
        var namePattern = $"%{term}%";

        // Pacientët = userat aktivë me profil pacienti. IsActive përputhet me
        // rregullin e krijimit të terminit, që gjithashtu kërkon user aktiv —
        // ndryshe do të gjeje dikë për të cilin s'mund të rezervosh.
        var rows =
            from p in _dbContext.PatientProfiles
            join u in _dbContext.Users on p.UserId equals u.Id
            where u.IsActive
            select new { Profile = p, User = u };

        rows = mode switch
        {
            SearchMode.Email => rows.Where(r => r.User.NormalizedEmail == normalizedEmail),

            // Chain-i i Replace-ve përkthehet nga Npgsql në replace() — krahasimi
            // ndodh në bazë, jo në memorie.
            SearchMode.Phone => rows.Where(r => r.User.PhoneNumber != null
                && r.User.PhoneNumber
                    .Replace(" ", "").Replace("-", "").Replace("(", "")
                    .Replace(")", "").Replace(".", "").Replace("+", "")
                    .EndsWith(phoneSuffix!)),

            _ => rows.Where(r => EF.Functions.ILike(r.User.FirstName + " " + r.User.LastName, namePattern)),
        };

        // Kërkimi me emër mbetet brenda klinikave të mia — shih koment-in e klasës.
        if (mode == SearchMode.Name && !isSuperAdmin)
        {
            rows = rows.Where(r => _dbContext.Appointments.Any(a =>
                a.PatientProfileId == r.Profile.Id
                && _dbContext.ClinicAdministrators.Any(ca =>
                    ca.UserId == currentUserId && ca.ClinicId == a.ClinicId)));
        }

        var totalItems = await rows.CountAsync(cancellationToken);

        var page = await rows
            .OrderBy(r => r.User.LastName).ThenBy(r => r.User.FirstName)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(r => new
            {
                PatientProfileId = r.Profile.Id,
                r.User.FirstName,
                r.User.LastName,
                r.User.Email,
                r.User.PhoneNumber,
                r.Profile.DateOfBirth,
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

        var items = page
            .Select(r => new AdminPatientSearchResultDto
            {
                PatientProfileId = r.PatientProfileId,
                FirstName = r.FirstName,
                LastName = r.LastName,
                // Pa lidhje me klinikën kthehet vetëm identifikuesi që u kërkua:
                // admini tashmë e dinte, ndërsa kontakti tjetër do të ishte PII e re.
                Email = r.HasRelationship || mode == SearchMode.Email ? r.Email : null,
                PhoneNumber = r.HasRelationship || mode == SearchMode.Phone ? r.PhoneNumber : null,
                DateOfBirth = r.HasRelationship ? r.DateOfBirth : null,
                HasRelationshipWithClinic = r.HasRelationship,
                IsUnclaimedAccount = r.IsUnclaimed,
                Dependents = r.HasRelationship
                    ? r.Dependents
                    : (IReadOnlyList<AdminPatientDependentDto>)Array.Empty<AdminPatientDependentDto>(),
            })
            .ToList();

        // Ekspozimi i të dhënave të pacientëve te stafi auditohet gjithmonë.
        // Termi ruhet me qëllim — "kush kërkoi kë" është e gjithë pika e auditit.
        _auditService.Record("PATIENT_SEARCHED_BY_ADMIN", nameof(PatientProfile), null, null,
            new { Query = term, Mode = mode.ToString(), ResultCount = totalItems });
        await _dbContext.SaveChangesAsync(cancellationToken);

        return new PagedResult<AdminPatientSearchResultDto>
        {
            Items = items,
            Page = query.Page,
            PageSize = query.PageSize,
            TotalItems = totalItems
        };
    }

    public async Task<AdminPatientDto> CreateAsync(
        AdminCreatePatientRequest request, CancellationToken cancellationToken = default)
    {
        var email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim();
        var phone = request.PhoneNumber.Trim();

        // --- Parandalimi i dublikatave ---
        // Është shumë më lirë ta ndalosh dublikatin këtu sesa të bashkosh dy histori
        // terminesh më vonë. Recepsioni bën kërkimin i pari; nëse prapë arrin këtu me
        // një kontakt ekzistues, merr 409 dhe e rigjen pacientin me kërkim.
        if (email is not null && await _userManager.FindByEmailAsync(email) is not null)
        {
            throw new ConflictException(
                "email-exists", "Ekziston tashmë një llogari me këtë email. Kërkoje pacientin në vend që ta krijosh.");
        }

        var phoneSuffix = PhoneSuffix(phone);
        if (phoneSuffix is not null)
        {
            var phoneTaken = await (
                from p in _dbContext.PatientProfiles
                join u in _dbContext.Users on p.UserId equals u.Id
                where u.IsActive && u.PhoneNumber != null
                      && u.PhoneNumber
                          .Replace(" ", "").Replace("-", "").Replace("(", "")
                          .Replace(")", "").Replace(".", "").Replace("+", "")
                          .EndsWith(phoneSuffix)
                select p.Id).AnyAsync(cancellationToken);

            if (phoneTaken)
            {
                throw new ConflictException(
                    "phone-exists", "Ekziston tashmë një pacient me këtë numër telefoni. Kërkoje në vend që ta krijosh.");
            }
        }

        // --- Llogaria ---
        // Krijohet PA password: pacienti s'zgjodhi kurrë një, dhe leximi i një password-i
        // të gjeneruar në telefon është njëkohësisht i pasigurt dhe i papërdorshëm.
        // Me email, pacienti e merr llogarinë në dorëzim vetë përmes "kam harruar fjalëkalimin".
        // UserName bie te telefoni kur s'ka email — Identity kërkon UserName unik, jo email.
        var user = new ApplicationUser
        {
            // Pa email, UserName bie te telefoni — por i pastruar nga formatimi:
            // Identity.User.AllowedUserNameCharacters nuk i lejon hapësirat, kështu që
            // "+383 44 765 432" do të refuzohej si UserName i pavlefshëm.
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
            // Indeksi unik mbi NormalizedEmail — dy kërkesa paralele me të njëjtin email.
            // Kontrolli më lart është "lexo pastaj shkruaj" dhe s'e kap dot garën;
            // databaza e kap, dhe thirrësi merr të njëjtin 409 si në rrugën normale.
            throw new ConflictException(
                "email-exists", "Ekziston tashmë një llogari me këtë email. Kërkoje pacientin në vend që ta krijosh.");
        }

        if (!createResult.Succeeded)
        {
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
            IsUnclaimedAccount = true
        };
    }

    // ---------- Ndihmës ----------

    private enum SearchMode
    {
        Email,
        Phone,
        Name
    }

    private static SearchMode DetectMode(string term)
    {
        if (term.Contains('@'))
        {
            return SearchMode.Email;
        }

        // Mjaft shifra për të qenë numër i plotë telefoni, jo fragment emri.
        var digits = term.Count(char.IsDigit);
        var looksNumeric = term.All(c => char.IsDigit(c) || c is '+' or ' ' or '-' or '(' or ')' or '.');
        return looksNumeric && digits >= PhoneMatchDigits ? SearchMode.Phone : SearchMode.Name;
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

    /// <summary>Shifrat fundore të numrit, ose null nëse s'ka mjaft për krahasim të sigurt.</summary>
    private static string? PhoneSuffix(string phone)
    {
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        return digits.Length < PhoneMatchDigits ? null : digits[^PhoneMatchDigits..];
    }
}
