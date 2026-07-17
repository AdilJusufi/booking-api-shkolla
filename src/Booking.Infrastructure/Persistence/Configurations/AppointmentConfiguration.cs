using Booking.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Booking.Infrastructure.Persistence.Configurations;

public class AppointmentConfiguration : IEntityTypeConfiguration<Appointment>
{
    public void Configure(EntityTypeBuilder<Appointment> builder)
    {
        // Optimistic concurrency me kolonën e sistemit xmin të PostgreSQL —
        // çdo UPDATE konkurrent hedh DbUpdateConcurrencyException.
        builder.Property(a => a.Version).IsRowVersion();

        // Statusi si tekst në DB — i lexueshëm në psql dhe i qëndrueshëm ndaj rirenditjes së enum-it.
        builder.Property(a => a.Status)
            .HasConversion<string>()
            .HasMaxLength(30);

        builder.Property(a => a.PatientNote).HasMaxLength(1000);
        builder.Property(a => a.InternalNote).HasMaxLength(1000);
        builder.Property(a => a.CancellationReason).HasMaxLength(500);

        // Indeksi kryesor i kërkimit të mbivendosjeve dhe kalendarit të doktorit.
        builder.HasIndex(a => new { a.DoctorId, a.StartDateTime, a.EndDateTime });
        builder.HasIndex(a => new { a.ClinicBranchId, a.StartDateTime });
        builder.HasIndex(a => a.ClinicId);
        builder.HasIndex(a => a.PatientProfileId);
        builder.HasIndex(a => a.MedicalServiceId);
        builder.HasIndex(a => a.Status);

        // Historiku i termineve nuk fshihet kur fshihen entitetet e lidhura.
        builder.HasOne(a => a.Clinic).WithMany().HasForeignKey(a => a.ClinicId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(a => a.ClinicBranch).WithMany().HasForeignKey(a => a.ClinicBranchId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(a => a.Doctor).WithMany().HasForeignKey(a => a.DoctorId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(a => a.MedicalService).WithMany().HasForeignKey(a => a.MedicalServiceId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(a => a.PatientProfile).WithMany(p => p.Appointments).HasForeignKey(a => a.PatientProfileId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(a => a.Dependent).WithMany().HasForeignKey(a => a.DependentId).OnDelete(DeleteBehavior.Restrict);

        builder.ToTable(t => t.HasCheckConstraint(
            "CK_Appointments_Times",
            "\"EndDateTime\" > \"StartDateTime\""));

        // Shënim: exclusion constraint kundër double-booking (btree_gist) shtohet
        // me SQL të papërpunuar në migration-in AddAppointmentOverlapConstraint (Faza 5).
    }
}
