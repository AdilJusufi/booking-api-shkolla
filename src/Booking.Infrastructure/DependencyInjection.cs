using System.Text;
using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Models;
using Booking.Application.Common.Security;
using Booking.Application.Features.Admin;
using Booking.Application.Features.Appointments;
using Booking.Application.Features.Auth;
using Booking.Application.Features.Patients;
using Booking.Application.Features.Availability;
using Booking.Application.Features.Clinics;
using Booking.Application.Features.Doctors;
using Booking.Application.Features.Schedules;
using Booking.Infrastructure.Auth;
using Booking.Infrastructure.Queries;
using Booking.Infrastructure.Services;
using Booking.Infrastructure.Common;
using Booking.Infrastructure.Identity;
using Booking.Infrastructure.Notifications;
using Booking.Infrastructure.Persistence;
using Booking.Infrastructure.Persistence.Interceptors;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace Booking.Infrastructure;

public static class DependencyInjection
{
    /// <param name="isDevelopment">
    /// Aktivizon lehtësira vetëm-për-zhvillim (p.sh. DevEmailInbox, që i ruan
    /// token-at e email-it në memorie). Duhet të mbetet false kudo tjetër.
    /// </param>
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services, IConfiguration configuration, bool isDevelopment = false)
    {
        services.AddSingleton<IDateTimeProvider, DateTimeProvider>();
        services.AddSingleton<ITimeZoneService, TimeZoneService>();
        services.AddScoped<AuditableEntityInterceptor>();

        services.AddDbContext<BookingDbContext>((serviceProvider, options) =>
        {
            var connectionString = configuration.GetConnectionString("BookingDb")
                ?? throw new InvalidOperationException("Connection string 'BookingDb' mungon në konfigurim.");

            options.UseNpgsql(connectionString);
            options.AddInterceptors(serviceProvider.GetRequiredService<AuditableEntityInterceptor>());
        });

        services.AddDataProtectionWithPersistedKeys();

        services.AddIdentityAndAuth(configuration);

        services.AddEmail(configuration, isDevelopment);
        services.AddScoped<ISmsService, LoggingSmsService>();

        services.AddScoped<IClinicQueryService, ClinicQueryService>();
        services.AddScoped<IDoctorQueryService, DoctorQueryService>();
        services.AddScoped<IAvailabilityService, AvailabilityService>();
        services.AddScoped<IScheduleService, ScheduleService>();
        services.AddScoped<IAppointmentService, AppointmentService>();
        services.AddScoped<IDoctorAppointmentService, DoctorAppointmentService>();
        services.AddScoped<IAppointmentNotificationService, LoggingAppointmentNotificationService>();
        services.AddScoped<IClinicNotificationService, LoggingClinicNotificationService>();
        services.AddScoped<IPatientService, PatientService>();
        services.AddScoped<IAuditService, AuditService>();
        services.AddScoped<IEmailAbuseGuard, EmailAbuseGuard>();
        services.AddScoped<TenantAccessService>();
        services.AddScoped<IClinicAdminService, ClinicAdminService>();
        services.AddScoped<ISuperAdminService, SuperAdminService>();
        services.AddScoped<IAdminAppointmentService, AdminAppointmentService>();
        services.AddScoped<IAdminPatientService, AdminPatientService>();

        services.Configure<BookingSettings>(configuration.GetSection(BookingSettings.SectionName));
        services.Configure<FrontendSettings>(configuration.GetSection(FrontendSettings.SectionName));
        services.Configure<CloudinarySettings>(configuration.GetSection(CloudinarySettings.SectionName));
        services.Configure<EmailAbuseLimitSettings>(configuration.GetSection(EmailAbuseLimitSettings.SectionName));

        return services;
    }

    /// <summary>
    /// Development: LoggingEmailService (asgjë s'del vërtet), i dekoruar me DevEmailInbox
    /// që /api/dev/emails t'i japë frontend-it token-at pa gërmuar nëpër logje.
    /// Kudo tjetër: ResendEmailService real, mbi HttpClient të regjistruar përmes
    /// IHttpClientFactory (jo <c>new HttpClient()</c> — shmang shterimin e socket-eve).
    /// </summary>
    private static void AddEmail(this IServiceCollection services, IConfiguration configuration, bool isDevelopment)
    {
        services.Configure<ResendSettings>(configuration.GetSection(ResendSettings.SectionName));

        if (isDevelopment)
        {
            services.AddScoped<IEmailService, LoggingEmailService>();

            // Dekoron IEmailService që token-at e konfirmimit/rivendosjes të jenë
            // të lexueshëm nga GET /api/dev/emails pa gërmuar nëpër logje.
            // Regjistrimi i fundit i IEmailService fiton — pa nevojë për Scrutor.
            services.AddSingleton<DevEmailInbox>();
            services.AddScoped<LoggingEmailService>();
            services.AddScoped<IEmailService>(sp => new DevInboxEmailService(
                sp.GetRequiredService<LoggingEmailService>(),
                sp.GetRequiredService<DevEmailInbox>(),
                sp.GetRequiredService<IDateTimeProvider>()));

            return;
        }

        services.AddHttpClient<ResendEmailService>(client =>
        {
            client.BaseAddress = new Uri("https://api.resend.com/");
            client.Timeout = TimeSpan.FromSeconds(10);
        });
        services.AddScoped<IEmailService>(sp => sp.GetRequiredService<ResendEmailService>());
    }

    /// <summary>
    /// Emri i aplikacionit për Data Protection. Fiks dhe i shkruar shprehimisht: pa të,
    /// ASP.NET Core e nxjerr nga ContentRootPath, i cili ndryshon mes container-it
    /// (/app) dhe host-it të testeve — dhe një emër tjetër do të thotë purpose chain
    /// tjetër, pra token-a që nuk deshifrohen dot edhe kur çelësi është i njëjti.
    /// Mos e ndrysho: çdo ndryshim i shpall të pavlefshëm token-at ekzistues.
    /// </summary>
    private const string DataProtectionApplicationName = "Booking.Api";

    /// <summary>
    /// Ruan key ring-un e Data Protection në databazë (tabela "DataProtectionKeys").
    /// </summary>
    /// <remarks>
    /// Pa këtë, çelësat shkojnë te ~/.aspnet/DataProtection-Keys brenda container-it dhe
    /// humbin në çdo rinisje — Render (free tier) rindez në deploy, në idle spin-down dhe
    /// në mirëmbajtje. Token-at e AddDefaultTokenProviders() (konfirmim email-i, rivendosje
    /// fjalëkalimi) nënshkruhen me këtë key ring, pra do të refuzoheshin si "invalid" edhe
    /// kur janë krejt legjitimë dhe pa skaduar.
    ///
    /// Rrotullimi mbetet me default-et e framework-ut: çelës i ri çdo 90 ditë, kurse
    /// çelësat e vjetër NUK fshihen — mbeten të lexueshëm, kështu që token-at e lëshuar
    /// para rrotullimit vazhdojnë të validohen deri sa të skadojnë vetë.
    ///
    /// XML encryptor nuk konfigurohet me qëllim — shih raportin/README: çdo opsion i
    /// disponueshëm (certifikatë, DPAPI) do ta zhvendoste problemin te ruajtja e një
    /// çelësi tjetër, që në këtë mjedis do të përfundonte sërish në disk efemer ose në
    /// config. Mbrojtja aktuale është vetë databaza: Neon i mban të dhënat të enkriptuara
    /// at-rest dhe qasja kërkon connection string-un.
    /// </remarks>
    private static void AddDataProtectionWithPersistedKeys(this IServiceCollection services)
    {
        services
            .AddDataProtection()
            .SetApplicationName(DataProtectionApplicationName)
            .PersistKeysToDbContext<BookingDbContext>();
    }

    private static void AddIdentityAndAuth(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<JwtSettings>(configuration.GetSection(JwtSettings.SectionName));
        services.Configure<AuthSettings>(configuration.GetSection(AuthSettings.SectionName));

        services
            .AddIdentityCore<ApplicationUser>(options =>
            {
                // Qëllimisht false, dhe kjo NUK e heq unicitetin e email-it.
                // Identity e trajton RequireUniqueEmail si "email i detyrueshëm DHE unik";
                // fusha e detyrueshme e bën të pamundur krijimin e një pacienti me telefon
                // por pa email — rasti kryesor i rezervimit me telefon. Uniciteti mbahet
                // shprehimisht në kod te të dy vendet ku vendoset një email:
                // AuthService.RegisterPatientAsync dhe AdminPatientService.CreateAsync.
                options.User.RequireUniqueEmail = false;

                // Password policy — pasqyrohet edhe në PasswordRuleExtensions (FluentValidation).
                options.Password.RequiredLength = 8;
                options.Password.RequireDigit = true;
                options.Password.RequireUppercase = true;
                options.Password.RequireLowercase = true;
                options.Password.RequireNonAlphanumeric = false;

                // Account lockout pas tentimeve të dështuara.
                options.Lockout.AllowedForNewUsers = true;
                options.Lockout.MaxFailedAccessAttempts = 5;
                options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
            })
            .AddRoles<ApplicationRole>()
            .AddEntityFrameworkStores<BookingDbContext>()
            .AddDefaultTokenProviders();

        var jwtSettings = configuration.GetSection(JwtSettings.SectionName).Get<JwtSettings>()
            ?? throw new InvalidOperationException("Seksioni 'Jwt' mungon në konfigurim.");

        if (string.IsNullOrWhiteSpace(jwtSettings.Secret) || jwtSettings.Secret.Length < 32)
        {
            throw new InvalidOperationException(
                "Jwt:Secret duhet të ketë së paku 32 karaktere. Vendose me env var Jwt__Secret ose user secrets — kurrë në source code.");
        }

        services
            .AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
            })
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = jwtSettings.Issuer,
                    ValidateAudience = true,
                    ValidAudience = jwtSettings.Audience,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings.Secret)),
                    ClockSkew = TimeSpan.FromMinutes(1)
                };
            });

        services.AddAuthorization(options =>
        {
            options.AddPolicy(Policies.SuperAdminOnly, policy => policy.RequireRole(Roles.SuperAdmin));
            options.AddPolicy(Policies.ClinicAdminOnly, policy => policy.RequireRole(Roles.ClinicAdmin, Roles.SuperAdmin));
            options.AddPolicy(Policies.DoctorOnly, policy => policy.RequireRole(Roles.Doctor));
            options.AddPolicy(Policies.PatientOnly, policy => policy.RequireRole(Roles.Patient));
        });

        services.AddScoped<JwtTokenService>();
        services.AddScoped<IAuthService, AuthService>();
    }
}
