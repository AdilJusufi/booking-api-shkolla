using Booking.Domain.Entities;
using Booking.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Booking.Infrastructure.Persistence;

/// <summary>
/// DbContext-i i vetëm i sistemit — përfshin tabelat e Identity (users, roles, claims)
/// dhe entitetet e domain-it. Të gjitha kolonat datë-orë janë timestamptz (UTC).
/// </summary>
public class BookingDbContext : IdentityDbContext<ApplicationUser, ApplicationRole, Guid>
{
    public BookingDbContext(DbContextOptions<BookingDbContext> options) : base(options)
    {
    }

    public DbSet<PatientProfile> PatientProfiles => Set<PatientProfile>();
    public DbSet<Dependent> Dependents => Set<Dependent>();
    public DbSet<Clinic> Clinics => Set<Clinic>();
    public DbSet<ClinicBranch> ClinicBranches => Set<ClinicBranch>();
    public DbSet<ClinicAdministrator> ClinicAdministrators => Set<ClinicAdministrator>();
    public DbSet<Specialty> Specialties => Set<Specialty>();
    public DbSet<Doctor> Doctors => Set<Doctor>();
    public DbSet<DoctorSpecialty> DoctorSpecialties => Set<DoctorSpecialty>();
    public DbSet<DoctorClinicBranch> DoctorClinicBranches => Set<DoctorClinicBranch>();
    public DbSet<MedicalService> MedicalServices => Set<MedicalService>();
    public DbSet<DoctorService> DoctorServices => Set<DoctorService>();
    public DbSet<DoctorWorkingSchedule> DoctorWorkingSchedules => Set<DoctorWorkingSchedule>();
    public DbSet<DoctorUnavailability> DoctorUnavailabilities => Set<DoctorUnavailability>();
    public DbSet<Appointment> Appointments => Set<Appointment>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.ApplyConfigurationsFromAssembly(typeof(BookingDbContext).Assembly);

        builder.Entity<ApplicationUser>(user =>
        {
            user.Property(u => u.FirstName).HasMaxLength(100).IsRequired();
            user.Property(u => u.LastName).HasMaxLength(100).IsRequired();
        });
    }
}
