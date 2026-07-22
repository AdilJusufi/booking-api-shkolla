using Booking.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Booking.Infrastructure.Persistence.Configurations;

public class MedicalServiceConfiguration : IEntityTypeConfiguration<MedicalService>
{
    public void Configure(EntityTypeBuilder<MedicalService> builder)
    {
        builder.Property(s => s.Name).HasMaxLength(200).IsRequired();
        builder.Property(s => s.Description).HasMaxLength(1000);
        builder.Property(s => s.Price).HasPrecision(10, 2);
        builder.Property(s => s.Currency).HasMaxLength(3).IsRequired();

        builder.HasIndex(s => s.ClinicId);
        builder.HasIndex(s => s.SpecialtyId);

        builder.HasOne(s => s.Specialty)
            .WithMany()
            .HasForeignKey(s => s.SpecialtyId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.ToTable(t =>
        {
            t.HasCheckConstraint("CK_MedicalServices_Duration", "\"DurationMinutes\" > 0");
            t.HasCheckConstraint("CK_MedicalServices_Price", "\"Price\" >= 0");
        });
    }
}
