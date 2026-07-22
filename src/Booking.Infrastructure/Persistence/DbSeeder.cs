using Booking.Application.Common.Security;
using Booking.Domain.Entities;
using Booking.Domain.Enums;
using Booking.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Booking.Infrastructure.Persistence;

/// <summary>
/// Inicializimi i databazës: migrations (opsionale) + rolet + seed data për development.
/// Passwordet vijnë VETËM nga konfigurimi (env vars / appsettings.Development.json) — kurrë hardcoded.
/// ID-të janë fikse që testet e integrimit t'i referojnë në mënyrë deterministe.
/// </summary>
public static class DbSeeder
{
    // ID fikse për seed — të referueshme nga testet.
    public static class Ids
    {
        public static readonly Guid ClinicDardania = Guid.Parse("11111111-1111-1111-1111-111111111111");
        public static readonly Guid ClinicSunny = Guid.Parse("22222222-2222-2222-2222-222222222222");
        public static readonly Guid BranchDardania = Guid.Parse("11111111-aaaa-1111-1111-111111111111");
        public static readonly Guid BranchUlpiana = Guid.Parse("11111111-bbbb-1111-1111-111111111111");
        public static readonly Guid BranchSunny = Guid.Parse("22222222-aaaa-2222-2222-222222222222");
        public static readonly Guid SpecialtyDentist = Guid.Parse("33333333-0001-3333-3333-333333333333");
        public static readonly Guid SpecialtyPediatrician = Guid.Parse("33333333-0002-3333-3333-333333333333");
        public static readonly Guid ServiceDentalCleaning = Guid.Parse("44444444-0001-4444-4444-444444444444");
        public static readonly Guid ServiceDentalFilling = Guid.Parse("44444444-0002-4444-4444-444444444444");
        public static readonly Guid ServiceDentalCheckup = Guid.Parse("44444444-0003-4444-4444-444444444444");
        public static readonly Guid ServicePediatricCheckup = Guid.Parse("44444444-0004-4444-4444-444444444444");
        public static readonly Guid ServiceVaccination = Guid.Parse("44444444-0005-4444-4444-444444444444");
        public static readonly Guid DoctorArben = Guid.Parse("55555555-0001-5555-5555-555555555555");
        public static readonly Guid DoctorBlerta = Guid.Parse("55555555-0002-5555-5555-555555555555");
        public static readonly Guid DoctorDriton = Guid.Parse("55555555-0003-5555-5555-555555555555");
        public static readonly Guid DoctorElira = Guid.Parse("55555555-0004-5555-5555-555555555555");
        public static readonly Guid DoctorFatos = Guid.Parse("55555555-0005-5555-5555-555555555555");
    }

    public const string SuperAdminEmail = "superadmin@booking.dev";
    public const string ClinicAdminEmail = "admin@dardania.booking.dev";
    public const string PatientEmail = "pacienti@booking.dev";

    public static readonly string[] DoctorEmails =
    [
        "arben.gashi@booking.dev",
        "blerta.krasniqi@booking.dev",
        "driton.berisha@booking.dev",
        "elira.hoxha@booking.dev",
        "fatos.rexhepi@booking.dev"
    ];

    public static async Task InitializeAsync(IServiceProvider serviceProvider, IConfiguration configuration)
    {
        using var scope = serviceProvider.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BookingDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("DbSeeder");

        if (configuration.GetValue<bool>("Database:ApplyMigrationsOnStartup"))
        {
            logger.LogInformation("Duke aplikuar migrations...");
            await dbContext.Database.MigrateAsync();
        }

        await SeedRolesAsync(scope.ServiceProvider);

        if (configuration.GetValue<bool>("Seed:Enabled"))
        {
            await SeedDevelopmentDataAsync(scope.ServiceProvider, configuration, logger);
        }
    }

    private static async Task SeedRolesAsync(IServiceProvider serviceProvider)
    {
        var roleManager = serviceProvider.GetRequiredService<RoleManager<ApplicationRole>>();

        foreach (var roleName in Roles.All)
        {
            if (!await roleManager.RoleExistsAsync(roleName))
            {
                await roleManager.CreateAsync(new ApplicationRole(roleName));
            }
        }
    }

    private static async Task SeedDevelopmentDataAsync(
        IServiceProvider serviceProvider, IConfiguration configuration, Microsoft.Extensions.Logging.ILogger logger)
    {
        var dbContext = serviceProvider.GetRequiredService<BookingDbContext>();
        var userManager = serviceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        if (await dbContext.Clinics.AnyAsync())
        {
            return; // seed idempotent — të dhënat ekzistojnë tashmë
        }

        var superAdminPassword = configuration["Seed:SuperAdminPassword"];
        var defaultPassword = configuration["Seed:DefaultUserPassword"];
        if (string.IsNullOrWhiteSpace(superAdminPassword) || string.IsNullOrWhiteSpace(defaultPassword))
        {
            logger.LogWarning(
                "Seed u kapërcye: vendos Seed__SuperAdminPassword dhe Seed__DefaultUserPassword (env vars ose appsettings.Development.json).");
            return;
        }

        logger.LogInformation("Duke mbushur databazën me të dhëna development-i...");

        // --- SuperAdmin ---
        var superAdmin = await CreateUserAsync(userManager, SuperAdminEmail, "Super", "Admin", superAdminPassword, Roles.SuperAdmin);

        // --- Specializimet ---
        var specialties = new List<Specialty>
        {
            new() { Id = Ids.SpecialtyDentist, Name = "Dentist", Description = "Stomatologji" },
            new() { Id = Ids.SpecialtyPediatrician, Name = "Pediatrician", Description = "Pediatri" },
            new() { Name = "Ophthalmologist", Description = "Oftalmologji" },
            new() { Name = "Dermatologist", Description = "Dermatologji" },
            new() { Name = "Cardiologist", Description = "Kardiologji" },
            new() { Name = "Gynecologist", Description = "Gjinekologji" },
            new() { Name = "ENT", Description = "Otorinolaringologji (ORL)" },
            new() { Name = "FamilyMedicine", Description = "Mjekësi familjare" }
        };
        dbContext.Specialties.AddRange(specialties);

        // --- Klinikat + degët (Prishtinë) ---
        dbContext.Clinics.AddRange(
            new Clinic
            {
                Id = Ids.ClinicDardania,
                Name = "Klinika Dentare Dardania",
                Description = "Klinikë dentare me përvojë 15-vjeçare në Prishtinë.",
                PhoneNumber = "+383 44 111 111",
                Email = "info@dardania.booking.dev",
                IsApproved = true
            },
            new Clinic
            {
                Id = Ids.ClinicSunny,
                Name = "Klinika Pediatrike Sunny",
                Description = "Kujdes pediatrik për fëmijët e Prishtinës.",
                PhoneNumber = "+383 44 222 222",
                Email = "info@sunny.booking.dev",
                IsApproved = true
            });

        dbContext.ClinicBranches.AddRange(
            new ClinicBranch
            {
                Id = Ids.BranchDardania,
                ClinicId = Ids.ClinicDardania,
                Name = "Dega Dardania",
                Address = "Rr. Bill Klinton 45",
                City = "Prishtinë",
                Municipality = "Prishtinë",
                PhoneNumber = "+383 44 111 112"
            },
            new ClinicBranch
            {
                Id = Ids.BranchUlpiana,
                ClinicId = Ids.ClinicDardania,
                Name = "Dega Ulpiana",
                Address = "Rr. Zenel Salihu 12",
                City = "Prishtinë",
                Municipality = "Prishtinë",
                PhoneNumber = "+383 44 111 113"
            },
            new ClinicBranch
            {
                Id = Ids.BranchSunny,
                ClinicId = Ids.ClinicSunny,
                Name = "Dega Qendra",
                Address = "Bulevardi Nëna Terezë 8",
                City = "Prishtinë",
                Municipality = "Prishtinë",
                PhoneNumber = "+383 44 222 223"
            });

        // --- ClinicAdmin i Dardanisë ---
        var clinicAdmin = await CreateUserAsync(userManager, ClinicAdminEmail, "Adelina", "Berisha", defaultPassword, Roles.ClinicAdmin);
        dbContext.ClinicAdministrators.Add(new ClinicAdministrator { UserId = clinicAdmin.Id, ClinicId = Ids.ClinicDardania });

        // --- Shërbimet ---
        dbContext.MedicalServices.AddRange(
            new MedicalService
            {
                Id = Ids.ServiceDentalCleaning, ClinicId = Ids.ClinicDardania, SpecialtyId = Ids.SpecialtyDentist,
                Name = "Pastrim i dhëmbëve", DurationMinutes = 30, Price = 25
            },
            new MedicalService
            {
                Id = Ids.ServiceDentalFilling, ClinicId = Ids.ClinicDardania, SpecialtyId = Ids.SpecialtyDentist,
                Name = "Mbushje e dhëmbit", DurationMinutes = 45, Price = 40
            },
            new MedicalService
            {
                Id = Ids.ServiceDentalCheckup, ClinicId = Ids.ClinicDardania, SpecialtyId = Ids.SpecialtyDentist,
                Name = "Kontroll dentar", DurationMinutes = 30, Price = 20
            },
            new MedicalService
            {
                Id = Ids.ServicePediatricCheckup, ClinicId = Ids.ClinicSunny, SpecialtyId = Ids.SpecialtyPediatrician,
                Name = "Kontroll pediatrik", DurationMinutes = 30, Price = 25
            },
            new MedicalService
            {
                Id = Ids.ServiceVaccination, ClinicId = Ids.ClinicSunny, SpecialtyId = Ids.SpecialtyPediatrician,
                Name = "Vaksinim", DurationMinutes = 15, Price = 15
            });

        // --- Doktorët ---
        var doctorDefinitions = new[]
        {
            new { Id = Ids.DoctorArben, Email = DoctorEmails[0], First = "Arben", Last = "Gashi", License = "LIC-0001",
                  Specialty = Ids.SpecialtyDentist, Branches = new[] { Ids.BranchDardania },
                  Services = new[] { Ids.ServiceDentalCleaning, Ids.ServiceDentalFilling, Ids.ServiceDentalCheckup }, Years = 12 },
            new { Id = Ids.DoctorBlerta, Email = DoctorEmails[1], First = "Blerta", Last = "Krasniqi", License = "LIC-0002",
                  Specialty = Ids.SpecialtyDentist, Branches = new[] { Ids.BranchDardania, Ids.BranchUlpiana },
                  Services = new[] { Ids.ServiceDentalCleaning, Ids.ServiceDentalCheckup }, Years = 8 },
            new { Id = Ids.DoctorDriton, Email = DoctorEmails[2], First = "Driton", Last = "Berisha", License = "LIC-0003",
                  Specialty = Ids.SpecialtyDentist, Branches = new[] { Ids.BranchUlpiana },
                  Services = new[] { Ids.ServiceDentalFilling, Ids.ServiceDentalCheckup }, Years = 15 },
            new { Id = Ids.DoctorElira, Email = DoctorEmails[3], First = "Elira", Last = "Hoxha", License = "LIC-0004",
                  Specialty = Ids.SpecialtyPediatrician, Branches = new[] { Ids.BranchSunny },
                  Services = new[] { Ids.ServicePediatricCheckup, Ids.ServiceVaccination }, Years = 10 },
            new { Id = Ids.DoctorFatos, Email = DoctorEmails[4], First = "Fatos", Last = "Rexhepi", License = "LIC-0005",
                  Specialty = Ids.SpecialtyPediatrician, Branches = new[] { Ids.BranchSunny },
                  Services = new[] { Ids.ServicePediatricCheckup }, Years = 6 }
        };

        foreach (var definition in doctorDefinitions)
        {
            var doctorUser = await CreateUserAsync(
                userManager, definition.Email, definition.First, definition.Last, defaultPassword, Roles.Doctor);

            var doctor = new Doctor
            {
                Id = definition.Id,
                UserId = doctorUser.Id,
                LicenseNumber = definition.License,
                YearsOfExperience = definition.Years,
                IsVerified = true
            };
            dbContext.Doctors.Add(doctor);
            dbContext.DoctorSpecialties.Add(new DoctorSpecialty { DoctorId = doctor.Id, SpecialtyId = definition.Specialty });

            foreach (var branchId in definition.Branches)
            {
                dbContext.DoctorClinicBranches.Add(new DoctorClinicBranch { DoctorId = doctor.Id, ClinicBranchId = branchId });

                // Orari: e hënë – e premte, 08:00–12:00 dhe 13:00–17:00, grid 30 min.
                foreach (var day in new[]
                         {
                             DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday,
                             DayOfWeek.Thursday, DayOfWeek.Friday
                         })
                {
                    dbContext.DoctorWorkingSchedules.AddRange(
                        new DoctorWorkingSchedule
                        {
                            DoctorId = doctor.Id, ClinicBranchId = branchId, DayOfWeek = day,
                            StartTime = new TimeOnly(8, 0), EndTime = new TimeOnly(12, 0), SlotDurationMinutes = 30
                        },
                        new DoctorWorkingSchedule
                        {
                            DoctorId = doctor.Id, ClinicBranchId = branchId, DayOfWeek = day,
                            StartTime = new TimeOnly(13, 0), EndTime = new TimeOnly(17, 0), SlotDurationMinutes = 30
                        });
                }
            }

            foreach (var serviceId in definition.Services)
            {
                dbContext.DoctorServices.Add(new DoctorService { DoctorId = doctor.Id, MedicalServiceId = serviceId });
            }
        }

        // --- Pacienti testues + një dependent ---
        var patientUser = await CreateUserAsync(userManager, PatientEmail, "Testi", "Pacienti", defaultPassword, Roles.Patient);
        var patientProfile = new PatientProfile
        {
            UserId = patientUser.Id,
            DateOfBirth = new DateOnly(1990, 5, 15),
            Gender = Gender.Male,
            Address = "Rr. Agim Ramadani 20",
            City = "Prishtinë"
        };
        dbContext.PatientProfiles.Add(patientProfile);
        dbContext.Dependents.Add(new Dependent
        {
            PatientProfileId = patientProfile.Id,
            FirstName = "Lira",
            LastName = "Pacienti",
            DateOfBirth = new DateOnly(2019, 3, 10),
            Gender = Gender.Female,
            Relationship = DependentRelationship.Child
        });

        await dbContext.SaveChangesAsync();
        logger.LogInformation("Seed u krye: 2 klinika, 3 degë, 5 doktorë, {SpecialtyCount} specializime.", specialties.Count);
    }

    private static async Task<ApplicationUser> CreateUserAsync(
        UserManager<ApplicationUser> userManager,
        string email, string firstName, string lastName, string password, string role)
    {
        var existing = await userManager.FindByEmailAsync(email);
        if (existing is not null)
        {
            return existing;
        }

        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            FirstName = firstName,
            LastName = lastName,
            EmailConfirmed = true,
            CreatedAt = DateTime.UtcNow
        };

        var result = await userManager.CreateAsync(user, password);
        if (!result.Succeeded)
        {
            throw new InvalidOperationException(
                $"Seed dështoi për {email}: {string.Join("; ", result.Errors.Select(e => e.Description))}");
        }

        await userManager.AddToRoleAsync(user, role);
        return user;
    }
}
