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
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace Booking.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
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

        services.AddIdentityAndAuth(configuration);

        services.AddScoped<IEmailService, LoggingEmailService>();
        services.AddScoped<ISmsService, LoggingSmsService>();

        services.AddScoped<IClinicQueryService, ClinicQueryService>();
        services.AddScoped<IDoctorQueryService, DoctorQueryService>();
        services.AddScoped<IAvailabilityService, AvailabilityService>();
        services.AddScoped<IScheduleService, ScheduleService>();
        services.AddScoped<IAppointmentService, AppointmentService>();
        services.AddScoped<IDoctorAppointmentService, DoctorAppointmentService>();
        services.AddScoped<IAppointmentNotificationService, LoggingAppointmentNotificationService>();
        services.AddScoped<IPatientService, PatientService>();
        services.AddScoped<IAuditService, AuditService>();
        services.AddScoped<TenantAccessService>();
        services.AddScoped<IClinicAdminService, ClinicAdminService>();
        services.AddScoped<ISuperAdminService, SuperAdminService>();
        services.AddScoped<IAdminAppointmentService, AdminAppointmentService>();

        services.Configure<BookingSettings>(configuration.GetSection(BookingSettings.SectionName));

        return services;
    }

    private static void AddIdentityAndAuth(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<JwtSettings>(configuration.GetSection(JwtSettings.SectionName));
        services.Configure<AuthSettings>(configuration.GetSection(AuthSettings.SectionName));

        services
            .AddIdentityCore<ApplicationUser>(options =>
            {
                options.User.RequireUniqueEmail = true;

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
