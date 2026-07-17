using Booking.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Booking.Infrastructure.Persistence.Configurations;

public class DoctorServiceConfiguration : IEntityTypeConfiguration<DoctorService>
{
    public void Configure(EntityTypeBuilder<DoctorService> builder)
    {
        builder.HasKey(ds => new { ds.DoctorId, ds.MedicalServiceId });

        builder.Property(ds => ds.CustomPrice).HasPrecision(10, 2);

        builder.HasOne(ds => ds.Doctor)
            .WithMany(d => d.DoctorServices)
            .HasForeignKey(ds => ds.DoctorId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(ds => ds.MedicalService)
            .WithMany(s => s.DoctorServices)
            .HasForeignKey(ds => ds.MedicalServiceId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.ToTable(t =>
        {
            t.HasCheckConstraint("CK_DoctorServices_CustomDuration",
                "\"CustomDurationMinutes\" IS NULL OR \"CustomDurationMinutes\" > 0");
            t.HasCheckConstraint("CK_DoctorServices_CustomPrice",
                "\"CustomPrice\" IS NULL OR \"CustomPrice\" >= 0");
        });
    }
}
